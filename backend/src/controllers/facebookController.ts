import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { FacebookAccount } from '../models/FacebookAccount';
import { Campaign } from '../models/Campaign';
import { FacebookApiService } from '../services/facebook/FacebookApiService';
import { TokenRefreshService } from '../services/facebook/TokenRefreshService';

export const getAuthUrl = (req: AuthRequest, res: Response): void => {
  const appId = process.env.FACEBOOK_APP_ID;
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI;
  const scopes = 'ads_management,ads_read';

  if (!appId || !redirectUri) {
    res.status(500).json({ error: 'Facebook app configuration missing' });
    return;
  }

  // Include user ID in state parameter so we know which user is connecting
  const state = Buffer.from(req.userId || '').toString('base64');
  const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=${state}`;

  res.json({ authUrl });
};

export const handleCallback = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { code, state } = req.query;

    if (!code) {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    // Extract user ID from state parameter
    let userId: string | undefined;
    if (state) {
      try {
        userId = Buffer.from(state as string, 'base64').toString('utf-8');
      } catch (error) {
        // If state decoding fails, try using it directly
        userId = state as string;
      }
    }

    if (!userId) {
      res.status(400).json({ error: 'Missing user ID in OAuth state' });
      return;
    }

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const redirectUri = process.env.FACEBOOK_REDIRECT_URI;

    if (!appId || !appSecret || !redirectUri) {
      res.status(500).json({ error: 'Facebook app configuration missing' });
      return;
    }

    // Exchange code for access token
    const tokenResponse = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
    );

    const tokenData = await tokenResponse.json() as { 
      access_token?: string; 
      error?: { message: string }; 
    };

    if (tokenData.error) {
      res.status(400).json({ error: tokenData.error.message });
      return;
    }

    if (!tokenData.access_token) {
      res.status(400).json({ error: 'No access token received from Facebook' });
      return;
    }

    const shortLivedToken = tokenData.access_token;

    // Exchange for long-lived token
    const apiService = new FacebookApiService(shortLivedToken);
    const tokenResult = await apiService.getLongLivedToken(shortLivedToken);
    const longLivedToken = tokenResult.accessToken;
    
    // Calculate token expiry (expires_in is in seconds)
    const tokenExpiry = new Date();
    tokenExpiry.setSeconds(tokenExpiry.getSeconds() + tokenResult.expiresIn);

    // Get ad accounts using the long-lived token
    const longLivedApiService = new FacebookApiService(longLivedToken);
    const adAccounts = await longLivedApiService.getAdAccounts();

    // Store each account
    const savedAccounts = [];
    for (const account of adAccounts) {
      const existingAccount = await FacebookAccount.findOne({
        userId,
        accountId: account.account_id,
      });

      if (existingAccount) {
        existingAccount.accessToken = longLivedToken;
        existingAccount.tokenExpiry = tokenExpiry;
        existingAccount.accountName = account.name;
        existingAccount.isActive = true;
        await existingAccount.save();
        savedAccounts.push(existingAccount);
      } else {
        const newAccount = new FacebookAccount({
          userId,
          accountId: account.account_id,
          accessToken: longLivedToken,
          tokenExpiry,
          accountName: account.name,
          isActive: true,
        });
        await newAccount.save();
        savedAccounts.push(newAccount);
      }
    }

    // Redirect to frontend with success message
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/campaigns?facebook_connected=true&accounts=${savedAccounts.length}`);
  } catch (error: any) {
    console.error('Facebook callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/campaigns?facebook_error=${encodeURIComponent(error.message || 'Failed to connect Facebook account')}`);
  }
};

export const getAccounts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const accounts = await FacebookAccount.find({
      userId: req.userId,
      isActive: true,
    }).select('-accessToken');

    res.json(accounts);
  } catch (error: any) {
    console.error('Get accounts error:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
};

export const getCampaigns = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId } = req.params;

    const facebookAccount = await FacebookAccount.findOne({
      userId: req.userId,
      _id: accountId,
    });

    if (!facebookAccount) {
      res.status(404).json({ error: 'Facebook account not found' });
      return;
    }

    // Check and refresh token if needed
    const tokenValid = await TokenRefreshService.checkAndRefreshToken(facebookAccount);
    if (!tokenValid) {
      res.status(401).json({ 
        error: 'Facebook token expired. Please reconnect your Facebook account.' 
      });
      return;
    }

    const apiService = new FacebookApiService(facebookAccount.accessToken);
    const campaigns = await apiService.getCampaigns(`act_${facebookAccount.accountId}`);

    // Sync campaigns to database
    for (const campaign of campaigns) {
      const existingCampaign = await Campaign.findOne({
        userId: req.userId,
        facebookCampaignId: campaign.id,
      });

      if (!existingCampaign) {
        await Campaign.create({
          userId: req.userId,
          facebookAccountId: facebookAccount._id,
          facebookCampaignId: campaign.id,
          name: campaign.name,
          objective: campaign.objective,
          status: campaign.status,
        });
      } else {
        existingCampaign.name = campaign.name;
        existingCampaign.objective = campaign.objective;
        existingCampaign.status = campaign.status;
        await existingCampaign.save();
      }
    }

    const dbCampaigns = await Campaign.find({
      userId: req.userId,
      facebookAccountId: accountId,
    });

    res.json(dbCampaigns);
  } catch (error: any) {
    console.error('Get campaigns error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch campaigns' });
  }
};

export const importFacebookAdsets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;

    const campaign = await Campaign.findOne({
      _id: campaignId,
      userId: req.userId,
    });

    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const facebookAccount = await FacebookAccount.findById((campaign as any).facebookAccountId);
    if (!facebookAccount) {
      res.status(404).json({ error: 'Facebook account not found' });
      return;
    }

    const { TokenRefreshService } = await import('../services/facebook/TokenRefreshService');
    await TokenRefreshService.checkAndRefreshToken(facebookAccount);
    
    const apiService = new FacebookApiService(facebookAccount.accessToken);
    const facebookAdsets = await apiService.getAdsets((campaign as any).facebookCampaignId);

    const { Adset } = await import('../models/Adset');
    const importedAdsets = [];

    for (const fbAdset of facebookAdsets) {
      // Check if already imported
      const existing = await Adset.findOne({
        userId: req.userId,
        facebookAdsetId: fbAdset.id,
      });

      if (existing) {
        continue; // Skip if already imported
      }

      // Fetch full adset details
      const adsetDetails = await apiService.getAdsetDetails(fbAdset.id);

      // Convert Facebook targeting to our format
      const targeting: any = {};
      if (adsetDetails.targeting) {
        if (adsetDetails.targeting.age_min) targeting.ageMin = adsetDetails.targeting.age_min;
        if (adsetDetails.targeting.age_max) targeting.ageMax = adsetDetails.targeting.age_max;
        if (adsetDetails.targeting.genders) targeting.genders = adsetDetails.targeting.genders;
        if (adsetDetails.targeting.geo_locations?.countries) {
          targeting.locations = adsetDetails.targeting.geo_locations.countries;
        }
        if (adsetDetails.targeting.interests) {
          targeting.interests = adsetDetails.targeting.interests.map((i: any) => i.name || i.id);
        }
        if (adsetDetails.targeting.behaviors) {
          targeting.behaviors = adsetDetails.targeting.behaviors.map((b: any) => b.name || b.id);
        }
        if (adsetDetails.targeting.publisher_platforms) {
          targeting.placements = adsetDetails.targeting.publisher_platforms;
        }
      }

      const newAdset = new Adset({
        userId: req.userId,
        campaignId: campaign._id,
        facebookAdsetId: fbAdset.id,
        name: adsetDetails.name || fbAdset.name,
        targeting,
        budget: adsetDetails.daily_budget ? adsetDetails.daily_budget / 100 : 0,
        status: adsetDetails.status || fbAdset.status,
        optimizationGoal: adsetDetails.optimization_goal,
        billingEvent: adsetDetails.billing_event,
        bidStrategy: adsetDetails.bid_strategy,
        bidAmount: adsetDetails.bid_amount,
        promotedObject: adsetDetails.promoted_object,
        attributionSpec: adsetDetails.attribution_spec,
        // conversion_specs is not available on AdSet API, but conversion info is in promoted_object
        conversionSpecs: undefined,
        dailyBudget: adsetDetails.daily_budget ? adsetDetails.daily_budget / 100 : undefined,
        lifetimeBudget: adsetDetails.lifetime_budget ? adsetDetails.lifetime_budget / 100 : undefined,
        startTime: adsetDetails.start_time,
        endTime: adsetDetails.end_time,
      });

      await newAdset.save();
      importedAdsets.push(newAdset);
    }

    res.json({
      success: true,
      imported: importedAdsets.length,
      adsets: importedAdsets,
    });
  } catch (error: any) {
    console.error('Import Facebook adsets error:', error);
    res.status(500).json({ error: error.message || 'Failed to import adsets from Facebook' });
  }
};

export const disconnectAccount = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { accountId } = req.params;

    const account = await FacebookAccount.findOne({
      userId: req.userId,
      _id: accountId,
    });

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    account.isActive = false;
    await account.save();

    res.json({ success: true });
  } catch (error: any) {
    console.error('Disconnect account error:', error);
    res.status(500).json({ error: 'Failed to disconnect account' });
  }
};


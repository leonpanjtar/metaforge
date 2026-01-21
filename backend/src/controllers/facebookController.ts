import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { FacebookAccount } from '../models/FacebookAccount';
import { Campaign } from '../models/Campaign';
import { UserSettings } from '../models/UserSettings';
import { FacebookApiService } from '../services/facebook/FacebookApiService';
import { TokenRefreshService } from '../services/facebook/TokenRefreshService';
import { getAccountUserIds, getAccountFilter } from '../utils/accountFilter';
import { UserAccount } from '../models/UserAccount';

export const getAuthUrl = (req: AuthRequest, res: Response): void => {
  const appId = process.env.FACEBOOK_APP_ID;
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI;
  const scopes = 'ads_management,ads_read,pages_show_list';

  if (!appId || !redirectUri) {
    res.status(500).json({ error: 'Facebook app configuration missing' });
    return;
  }

  // Include user ID and account ID in state parameter
  const accountId = req.headers['x-account-id'] as string;
  const stateData = {
    userId: req.userId || '',
    accountId: accountId || '',
  };
  const state = Buffer.from(JSON.stringify(stateData)).toString('base64');
  const authUrl = `https://www.facebook.com/v24.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=${state}`;

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

    // Extract user ID and account ID from state parameter
    let userId: string | undefined;
    let organizationAccountId: string | undefined;
    if (state) {
      try {
        const decoded = Buffer.from(state as string, 'base64').toString('utf-8');
        try {
          const stateData = JSON.parse(decoded);
          userId = stateData.userId;
          organizationAccountId = stateData.accountId;
        } catch {
          // Fallback: treat as plain user ID (backward compatibility)
          userId = decoded;
        }
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
      `https://graph.facebook.com/v24.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
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
        // Update organizationAccountId if provided
        if (organizationAccountId) {
          existingAccount.organizationAccountId = organizationAccountId as any;
        }
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
          organizationAccountId: organizationAccountId as any,
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
    // Get all user IDs in the current account
    const accountUserIds = await getAccountUserIds(req);
    
    // Fetch Facebook accounts from all users in the account
    const accounts = await FacebookAccount.find({
      userId: { $in: accountUserIds },
      isActive: true,
    }).select('-accessToken').populate('userId', 'name email');

    res.json(accounts);
  } catch (error: any) {
    console.error('Get accounts error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch accounts' });
  }
};

export const getCampaigns = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId } = req.params;

    // Get all user IDs in the current account (as ObjectIds)
    const { getAccountUserObjectIds } = await import('../utils/accountFilter');
    const accountUserObjectIds = await getAccountUserObjectIds(req);

    const facebookAccount = await FacebookAccount.findOne({
      userId: { $in: accountUserObjectIds },
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

    // Get account filter to set accountId on campaigns
    const campaignAccountFilter = await getAccountFilter(req);

    // Sync campaigns to database
    // Use facebookCampaignId + facebookAccountId as unique key to prevent duplicates
    for (const campaign of campaigns) {
      // Check if campaign already exists for this Facebook account (prevents duplicates across users)
      const existingCampaign = await Campaign.findOne({
        facebookAccountId: facebookAccount._id,
        facebookCampaignId: campaign.id,
      });

      if (!existingCampaign) {
        // Create new campaign
        await Campaign.create({
          userId: req.userId,
          accountId: campaignAccountFilter.accountId,
          facebookAccountId: facebookAccount._id,
          facebookCampaignId: campaign.id,
          name: campaign.name,
          objective: campaign.objective,
          status: campaign.status,
        });
      } else {
        // Update existing campaign
        existingCampaign.name = campaign.name;
        existingCampaign.objective = campaign.objective;
        existingCampaign.status = campaign.status;
        // Update accountId if not set (for backward compatibility)
        if (!existingCampaign.accountId && campaignAccountFilter.accountId) {
          existingCampaign.accountId = campaignAccountFilter.accountId as any;
        }
        await existingCampaign.save();
      }
    }

    // Get campaigns from the account (query by accountId first, then fallback to userId)
    const campaignQuery: any = { facebookAccountId: accountId };
    
    if (campaignAccountFilter.accountId) {
      campaignQuery.accountId = new mongoose.Types.ObjectId(campaignAccountFilter.accountId);
    } else {
      // Fallback to userId for backward compatibility
      campaignQuery.userId = { $in: accountUserObjectIds };
    }
    
    const dbCampaigns = await Campaign.find(campaignQuery);

    res.json(dbCampaigns);
  } catch (error: any) {
    console.error('Get campaigns error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch campaigns' });
  }
};

export const importFacebookAdsets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;

    // Get account filter to set accountId on imported adsets
    const accountFilter = await getAccountFilter(req);

    // Get all user IDs in the current account (as ObjectIds)
    const { getAccountUserObjectIds } = await import('../utils/accountFilter');
    const accountUserObjectIds = await getAccountUserObjectIds(req);

    const campaign = await Campaign.findOne({
      _id: campaignId,
      userId: { $in: accountUserObjectIds },
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
    const updatedAdsets = [];
    const deletedAdsets = [];

    // Get all Facebook adset IDs from the response
    const facebookAdsetIds = new Set(facebookAdsets.map((a: any) => a.id));

    // Get all existing adsets for this campaign that have a facebookAdsetId
    const existingAdsets = await Adset.find({
      userId: { $in: accountUserObjectIds },
      campaignId: campaign._id,
      facebookAdsetId: { $exists: true, $ne: null },
    });

    // Find adsets that were deleted on Facebook
    for (const existing of existingAdsets) {
      if (existing.facebookAdsetId && !facebookAdsetIds.has(existing.facebookAdsetId)) {
        // Adset was deleted on Facebook - remove it from our database
        await Adset.deleteOne({ _id: existing._id });
        deletedAdsets.push(existing._id.toString());
      }
    }

    for (const fbAdset of facebookAdsets) {
      // Check if already exists (from any user in the account)
      const existing = await Adset.findOne({
        userId: { $in: accountUserObjectIds },
        facebookAdsetId: fbAdset.id,
      });

      if (existing) {
        // Update existing adset with latest data from Facebook
        try {
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

          // Update existing adset
          existing.name = adsetDetails.name || fbAdset.name;
          existing.targeting = targeting;
          existing.budget = adsetDetails.daily_budget ? adsetDetails.daily_budget / 100 : existing.budget;
          existing.status = adsetDetails.status || fbAdset.status;
          existing.optimizationGoal = adsetDetails.optimization_goal;
          existing.billingEvent = adsetDetails.billing_event;
          existing.bidStrategy = adsetDetails.bid_strategy;
          existing.bidAmount = adsetDetails.bid_amount;
          existing.promotedObject = adsetDetails.promoted_object;
          existing.attributionSpec = adsetDetails.attribution_spec;
          existing.dailyBudget = adsetDetails.daily_budget ? adsetDetails.daily_budget / 100 : existing.dailyBudget;
          existing.lifetimeBudget = adsetDetails.lifetime_budget ? adsetDetails.lifetime_budget / 100 : existing.lifetimeBudget;
          existing.startTime = adsetDetails.start_time;
          existing.endTime = adsetDetails.end_time;
          
          // Update accountId if not set (for backward compatibility)
          if (!existing.accountId && accountFilter.accountId) {
            existing.accountId = accountFilter.accountId as any;
          }

          await existing.save();
          updatedAdsets.push(existing);
        } catch (error: any) {
          console.warn(`Failed to update adset ${fbAdset.id}:`, error.message);
          // Continue with other adsets
        }
        continue;
      }

      // New adset - import it
      try {
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
          accountId: accountFilter.accountId,
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
          createdByApp: false, // Imported from Facebook, not created by app
        });

        await newAdset.save();
        importedAdsets.push(newAdset);
      } catch (error: any) {
        console.warn(`Failed to import adset ${fbAdset.id}:`, error.message);
        // Continue with other adsets
      }
    }

    res.json({
      success: true,
      imported: importedAdsets.length,
      updated: updatedAdsets.length,
      deleted: deletedAdsets.length,
      adsets: [...importedAdsets, ...updatedAdsets],
    });
  } catch (error: any) {
    console.error('Import Facebook adsets error:', error);
    res.status(500).json({ error: error.message || 'Failed to import adsets from Facebook' });
  }
};

export const getPagesForCampaign = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const facebookAccount = await FacebookAccount.findById(
      (campaign as any).facebookAccountId
    );
    if (!facebookAccount) {
      res.status(404).json({ error: 'Facebook account not found' });
      return;
    }

    // Refresh token if needed
    await TokenRefreshService.checkAndRefreshToken(facebookAccount);

    const apiService = new FacebookApiService(facebookAccount.accessToken);
    const pages = await apiService.getPages();

    res.json(pages);
  } catch (error: any) {
    console.error('Get pages for campaign error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch Facebook pages' });
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

    // Clear active account if this was the active one
    const settings = await UserSettings.findOne({ userId: req.userId });
    if (settings && settings.activeFacebookAccountId?.toString() === accountId) {
      settings.activeFacebookAccountId = undefined;
      settings.activeFacebookPageId = undefined;
      settings.activeFacebookPageName = undefined;
      await settings.save();
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Disconnect account error:', error);
    res.status(500).json({ error: 'Failed to disconnect account' });
  }
};

// Get active Facebook account and page
export const getActiveAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const settings = await UserSettings.findOne({ userId: req.userId });
    
    if (!settings || !settings.activeFacebookAccountId) {
      res.json({ activeAccount: null, activePage: null });
      return;
    }

    const account = await FacebookAccount.findById(settings.activeFacebookAccountId)
      .select('-accessToken');
    
    if (!account) {
      // Clear invalid active account
      settings.activeFacebookAccountId = undefined;
      settings.activeFacebookPageId = undefined;
      settings.activeFacebookPageName = undefined;
      await settings.save();
      res.json({ activeAccount: null, activePage: null });
      return;
    }

    res.json({
      activeAccount: {
        _id: account._id,
        accountId: account.accountId,
        accountName: account.accountName,
        isActive: account.isActive,
      },
      activePage: settings.activeFacebookPageId ? {
        id: settings.activeFacebookPageId,
        name: settings.activeFacebookPageName,
      } : null,
    });
  } catch (error: any) {
    console.error('Get active account error:', error);
    res.status(500).json({ error: 'Failed to fetch active account' });
  }
};

// Set active Facebook account and page
export const setActiveAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, pageId, pageName } = req.body;

    if (!accountId) {
      res.status(400).json({ error: 'Account ID is required' });
      return;
    }

    // Verify account belongs to user
    const account = await FacebookAccount.findOne({
      userId: req.userId,
      _id: accountId,
      isActive: true,
    });

    if (!account) {
      res.status(404).json({ error: 'Account not found or inactive' });
      return;
    }

    // Verify page if provided
    if (pageId) {
      await TokenRefreshService.checkAndRefreshToken(account);
      const apiService = new FacebookApiService(account.accessToken);
      const pages = await apiService.getPages();
      const pageExists = pages.some((p) => p.id === pageId);
      
      if (!pageExists) {
        res.status(404).json({ error: 'Facebook page not found' });
        return;
      }
    }

    // Update or create settings
    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.userId },
      {
        activeFacebookAccountId: accountId,
        activeFacebookPageId: pageId || undefined,
        activeFacebookPageName: pageName || undefined,
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      activeAccount: {
        _id: account._id,
        accountId: account.accountId,
        accountName: account.accountName,
      },
      activePage: pageId ? { id: pageId, name: pageName } : null,
    });
  } catch (error: any) {
    console.error('Set active account error:', error);
    res.status(500).json({ error: error.message || 'Failed to set active account' });
  }
};

// Get all available accounts and pages for selection
export const getAccountsForSelection = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const accounts = await FacebookAccount.find({
      userId: req.userId,
      isActive: true,
    }).select('-accessToken');

    // Get pages for each account
    const accountsWithPages = await Promise.all(
      accounts.map(async (account) => {
        try {
          await TokenRefreshService.checkAndRefreshToken(account);
          const apiService = new FacebookApiService(account.accessToken);
          const pages = await apiService.getPages();
          return {
            _id: account._id,
            accountId: account.accountId,
            accountName: account.accountName,
            pages: pages || [],
          };
        } catch (error: any) {
          console.error(`Failed to get pages for account ${account._id}:`, error);
          return {
            _id: account._id,
            accountId: account.accountId,
            accountName: account.accountName,
            pages: [],
          };
        }
      })
    );

    res.json(accountsWithPages);
  } catch (error: any) {
    console.error('Get accounts for selection error:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
};


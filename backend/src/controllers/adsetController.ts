import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Adset } from '../models/Adset';
import { Campaign } from '../models/Campaign';

export const createAdset = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { campaignId, name, targeting, budget, schedule, optimizationGoal, billingEvent, bidStrategy, bidAmount, promotedObject, attributionSpec, conversionSpecs, dailyBudget, lifetimeBudget, startTime, endTime } = req.body;

    if (!campaignId || !name || !targeting || budget === undefined) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const campaign = await Campaign.findOne({
      _id: campaignId,
      userId: req.userId,
    });

    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const adset = new Adset({
      userId: req.userId,
      campaignId,
      name,
      targeting,
      budget,
      schedule,
      status: 'PAUSED',
      optimizationGoal,
      billingEvent,
      bidStrategy,
      bidAmount,
      promotedObject,
      attributionSpec,
      conversionSpecs,
      dailyBudget: dailyBudget || budget,
      lifetimeBudget,
      startTime,
      endTime,
    });

    await adset.save();

    res.status(201).json(adset);
  } catch (error: any) {
    console.error('Create adset error:', error);
    res.status(500).json({ error: error.message || 'Failed to create adset' });
  }
};

export const getAdsets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.query;

    const query: any = { userId: req.userId };
    if (campaignId) {
      query.campaignId = campaignId;
    }

    const adsets = await Adset.find(query)
      .populate('campaignId', 'name')
      .sort({ createdAt: -1 });

    res.json(adsets);
  } catch (error: any) {
    console.error('Get adsets error:', error);
    res.status(500).json({ error: 'Failed to fetch adsets' });
  }
};

export const getAdset = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const adset = await Adset.findOne({
      _id: id,
      userId: req.userId,
    }).populate('campaignId', 'name');

    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    res.json(adset);
  } catch (error: any) {
    console.error('Get adset error:', error);
    res.status(500).json({ error: 'Failed to fetch adset' });
  }
};

export const syncAdsetFromFacebook = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const adset = await Adset.findOne({
      _id: id,
      userId: req.userId,
    }).populate('campaignId');

    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    if (!adset.facebookAdsetId) {
      res.status(400).json({ error: 'Adset not deployed to Facebook yet' });
      return;
    }

    const campaign = adset.campaignId as any;
    const { FacebookAccount } = await import('../models/FacebookAccount');
    const facebookAccount = await FacebookAccount.findById(campaign.facebookAccountId);

    if (!facebookAccount) {
      res.status(404).json({ error: 'Facebook account not found' });
      return;
    }

    const { FacebookApiService } = await import('../services/facebook/FacebookApiService');
    const { TokenRefreshService } = await import('../services/facebook/TokenRefreshService');
    
    await TokenRefreshService.checkAndRefreshToken(facebookAccount);
    const apiService = new FacebookApiService(facebookAccount.accessToken);
    const facebookDetails = await apiService.getAdsetDetails(adset.facebookAdsetId);

    // Update adset with Facebook data
    adset.name = facebookDetails.name || adset.name;
    adset.status = facebookDetails.status || adset.status;
    adset.optimizationGoal = facebookDetails.optimization_goal;
    adset.billingEvent = facebookDetails.billing_event;
    adset.bidStrategy = facebookDetails.bid_strategy;
    adset.bidAmount = facebookDetails.bid_amount;
    adset.promotedObject = facebookDetails.promoted_object;
    adset.attributionSpec = facebookDetails.attribution_spec;
    // conversion_specs is not available on AdSet API - conversion info is in promoted_object
    adset.dailyBudget = facebookDetails.daily_budget ? facebookDetails.daily_budget / 100 : adset.budget;
    adset.lifetimeBudget = facebookDetails.lifetime_budget ? facebookDetails.lifetime_budget / 100 : undefined;
    adset.budgetRemaining = facebookDetails.budget_remaining ? facebookDetails.budget_remaining / 100 : undefined;
    adset.startTime = facebookDetails.start_time;
    adset.endTime = facebookDetails.end_time;

    // Update targeting if available
    if (facebookDetails.targeting) {
      if (facebookDetails.targeting.age_min) adset.targeting.ageMin = facebookDetails.targeting.age_min;
      if (facebookDetails.targeting.age_max) adset.targeting.ageMax = facebookDetails.targeting.age_max;
      if (facebookDetails.targeting.genders) adset.targeting.genders = facebookDetails.targeting.genders;
      if (facebookDetails.targeting.geo_locations?.countries) {
        adset.targeting.locations = facebookDetails.targeting.geo_locations.countries;
      }
      if (facebookDetails.targeting.interests) {
        adset.targeting.interests = facebookDetails.targeting.interests.map((i: any) => i.name || i.id);
      }
    }

    await adset.save();

    res.json(adset);
  } catch (error: any) {
    console.error('Sync adset error:', error);
    res.status(500).json({ error: error.message || 'Failed to sync adset from Facebook' });
  }
};

export const updateAdset = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Handle contentData updates separately to merge properly
    if (updates.contentData) {
      const adset = await Adset.findOne({ _id: id, userId: req.userId });
      if (!adset) {
        res.status(404).json({ error: 'Adset not found' });
        return;
      }
      
      console.log('Received contentData update:', JSON.stringify(updates.contentData, null, 2));
      
      // Merge contentData - explicitly set all fields to ensure they're saved
      const existingContentData = adset.contentData || {};
      const newContentData: any = {
        landingPageUrl: updates.contentData.landingPageUrl !== undefined 
          ? String(updates.contentData.landingPageUrl || '') 
          : String(existingContentData.landingPageUrl || ''),
        angle: updates.contentData.angle !== undefined 
          ? String(updates.contentData.angle || '') 
          : String(existingContentData.angle || ''),
        keywords: Array.isArray(updates.contentData.keywords)
          ? updates.contentData.keywords 
          : (Array.isArray(existingContentData.keywords) ? existingContentData.keywords : []),
        importantThings: updates.contentData.importantThings !== undefined 
          ? String(updates.contentData.importantThings || '') 
          : String(existingContentData.importantThings || ''),
        baseAssets: Array.isArray(updates.contentData.baseAssets)
          ? updates.contentData.baseAssets 
          : (Array.isArray(existingContentData.baseAssets) ? existingContentData.baseAssets : []),
        facebookPageId: updates.contentData.facebookPageId !== undefined
          ? String(updates.contentData.facebookPageId || '')
          : String(existingContentData.facebookPageId || ''),
        facebookPageName: updates.contentData.facebookPageName !== undefined
          ? String(updates.contentData.facebookPageName || '')
          : String(existingContentData.facebookPageName || ''),
      };
      
      console.log('Merged contentData:', JSON.stringify(newContentData, null, 2));
      
      // Remove contentData from updates to avoid overwriting
      delete updates.contentData;
      
      // Use updateOne with $set to force save all fields including empty strings
      await Adset.updateOne(
        { _id: id, userId: req.userId },
        {
          $set: {
            contentData: newContentData,
            ...updates,
          },
        }
      );
      
      // Fetch updated adset
      const updatedAdset = await Adset.findOne({ _id: id, userId: req.userId });
      
      if (!updatedAdset) {
        res.status(404).json({ error: 'Adset not found after update' });
        return;
      }
      
      console.log('Saved adset contentData:', JSON.stringify(updatedAdset.contentData, null, 2));
      
      res.json(updatedAdset);
    } else {
      const adset = await Adset.findOneAndUpdate(
        { _id: id, userId: req.userId },
        updates,
        { new: true }
      );

      if (!adset) {
        res.status(404).json({ error: 'Adset not found' });
        return;
      }

      res.json(adset);
    }
  } catch (error: any) {
    console.error('Update adset error:', error);
    res.status(500).json({ error: error.message || 'Failed to update adset' });
  }
};

export const copyAdsetSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params; // Target adset ID
    const { sourceAdsetId } = req.body;

    if (!sourceAdsetId) {
      res.status(400).json({ error: 'sourceAdsetId is required' });
      return;
    }

    // Find target adset
    const targetAdset = await Adset.findOne({
      _id: id,
      userId: req.userId,
    }).populate('campaignId');

    if (!targetAdset) {
      res.status(404).json({ error: 'Target adset not found' });
      return;
    }

    // Check if target adset is deployed
    if (targetAdset.facebookAdsetId) {
      res.status(400).json({ error: 'Cannot copy settings to a deployed adset. Please create a new adset instead.' });
      return;
    }

    // Find source adset
    const sourceAdset = await Adset.findOne({
      _id: sourceAdsetId,
      userId: req.userId,
    }).populate('campaignId');

    if (!sourceAdset) {
      res.status(404).json({ error: 'Source adset not found' });
      return;
    }

    const campaign: any = targetAdset.campaignId;

    // If source adset has Facebook ID, fetch full details from Facebook
    let facebookDetails: any = null;
    if (sourceAdset.facebookAdsetId) {
      try {
        const { FacebookAccount } = await import('../models/FacebookAccount');
        const facebookAccount = await FacebookAccount.findById(
          (campaign as any).facebookAccountId
        );
        
        if (facebookAccount) {
          const { FacebookApiService } = await import('../services/facebook/FacebookApiService');
          const { TokenRefreshService } = await import('../services/facebook/TokenRefreshService');
          
          await TokenRefreshService.checkAndRefreshToken(facebookAccount);
          const apiService = new FacebookApiService(facebookAccount.accessToken);
          facebookDetails = await apiService.getAdsetDetails(sourceAdset.facebookAdsetId);
        }
      } catch (error: any) {
        // Continue with local data if Facebook fetch fails
      }
    }

    // Copy all settings to target adset
    targetAdset.targeting = {
      ageMin: facebookDetails?.targeting?.age_min || sourceAdset.targeting.ageMin,
      ageMax: facebookDetails?.targeting?.age_max || sourceAdset.targeting.ageMax,
      genders: facebookDetails?.targeting?.genders || sourceAdset.targeting.genders || [],
      locations: facebookDetails?.targeting?.geo_locations?.countries || sourceAdset.targeting.locations || [],
      interests: facebookDetails?.targeting?.interests 
        ? facebookDetails.targeting.interests.map((i: any) => i.name || i.id)
        : sourceAdset.targeting.interests || [],
      behaviors: sourceAdset.targeting.behaviors || [],
      detailedTargeting: sourceAdset.targeting.detailedTargeting || [],
      placements: sourceAdset.targeting.placements || [],
      geoLocations: facebookDetails?.targeting?.geo_locations || sourceAdset.targeting.geoLocations || {},
      publisherPlatforms: sourceAdset.targeting.publisherPlatforms || [],
    };
    
    targetAdset.budget = facebookDetails?.daily_budget 
      ? facebookDetails.daily_budget / 100 
      : sourceAdset.budget;
    targetAdset.schedule = sourceAdset.schedule;
    targetAdset.optimizationGoal = facebookDetails?.optimization_goal || sourceAdset.optimizationGoal;
    targetAdset.billingEvent = facebookDetails?.billing_event || sourceAdset.billingEvent;
    targetAdset.bidStrategy = facebookDetails?.bid_strategy || sourceAdset.bidStrategy;
    targetAdset.bidAmount = facebookDetails?.bid_amount || sourceAdset.bidAmount;
    targetAdset.promotedObject = facebookDetails?.promoted_object 
      ? JSON.parse(JSON.stringify(facebookDetails.promoted_object))
      : sourceAdset.promotedObject 
        ? JSON.parse(JSON.stringify(sourceAdset.promotedObject))
        : undefined;
    targetAdset.attributionSpec = facebookDetails?.attribution_spec 
      ? JSON.parse(JSON.stringify(facebookDetails.attribution_spec))
      : sourceAdset.attributionSpec 
        ? JSON.parse(JSON.stringify(sourceAdset.attributionSpec))
        : undefined;
    targetAdset.dailyBudget = facebookDetails?.daily_budget 
      ? facebookDetails.daily_budget / 100 
      : sourceAdset.dailyBudget;
    targetAdset.lifetimeBudget = facebookDetails?.lifetime_budget 
      ? facebookDetails.lifetime_budget / 100 
      : sourceAdset.lifetimeBudget;
    targetAdset.startTime = facebookDetails?.start_time || sourceAdset.startTime;
    targetAdset.endTime = facebookDetails?.end_time || sourceAdset.endTime;

    await targetAdset.save();

    res.json({
      success: true,
      adset: targetAdset,
      message: 'Adset settings copied successfully.',
    });
  } catch (error: any) {
    console.error('copyAdsetSettings error:', error);
    res.status(500).json({ error: error.message || 'Failed to copy adset settings' });
  }
};

export const deleteAdset = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const adset = await Adset.findOneAndDelete({
      _id: id,
      userId: req.userId,
    });

    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete adset error:', error);
    res.status(500).json({ error: 'Failed to delete adset' });
  }
};

export const duplicateAdset = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, campaignId } = req.body;

    // Find the source adset
    const sourceAdset = await Adset.findOne({
      _id: id,
      userId: req.userId,
    }).populate('campaignId');

    if (!sourceAdset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    // Use provided campaignId or keep the same campaign
    const targetCampaignId = campaignId || (sourceAdset.campaignId as any)._id;

    // Verify the target campaign belongs to the user
    const campaign = await Campaign.findOne({
      _id: targetCampaignId,
      userId: req.userId,
    });

    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Generate new name if not provided
    const newName = name || `${sourceAdset.name} (Copy)`;

    // If source adset has Facebook ID, fetch full details from Facebook
    let facebookDetails: any = null;
    if (sourceAdset.facebookAdsetId) {
      try {
        const { FacebookAccount } = await import('../models/FacebookAccount');
        const facebookAccount = await FacebookAccount.findById(
          (campaign as any).facebookAccountId
        );
        
        if (facebookAccount) {
          const { FacebookApiService } = await import('../services/facebook/FacebookApiService');
          const { TokenRefreshService } = await import('../services/facebook/TokenRefreshService');
          
          await TokenRefreshService.checkAndRefreshToken(facebookAccount);
          const apiService = new FacebookApiService(facebookAccount.accessToken);
          facebookDetails = await apiService.getAdsetDetails(sourceAdset.facebookAdsetId);
        }
      } catch (error: any) {
        console.warn('Could not fetch Facebook adset details:', error.message);
        // Continue with local data if Facebook fetch fails
      }
    }

    // Create duplicate adset with ALL settings - deep copy everything
    const duplicatedAdset = new Adset({
      userId: req.userId,
      campaignId: targetCampaignId,
      name: newName,
      // Deep copy targeting
      targeting: {
        ageMin: facebookDetails?.targeting?.age_min || sourceAdset.targeting.ageMin,
        ageMax: facebookDetails?.targeting?.age_max || sourceAdset.targeting.ageMax,
        genders: facebookDetails?.targeting?.genders || sourceAdset.targeting.genders || [],
        locations: facebookDetails?.targeting?.geo_locations?.countries || sourceAdset.targeting.locations || [],
        interests: facebookDetails?.targeting?.interests 
          ? facebookDetails.targeting.interests.map((i: any) => i.name || i.id)
          : sourceAdset.targeting.interests || [],
        behaviors: sourceAdset.targeting.behaviors || [],
        detailedTargeting: sourceAdset.targeting.detailedTargeting || [],
        placements: sourceAdset.targeting.placements || [],
      },
      budget: facebookDetails?.daily_budget 
        ? facebookDetails.daily_budget / 100 
        : sourceAdset.budget,
      schedule: sourceAdset.schedule,
      status: 'PAUSED', // Always start duplicated adsets as paused
      // Copy ALL Facebook settings
      optimizationGoal: facebookDetails?.optimization_goal || sourceAdset.optimizationGoal,
      billingEvent: facebookDetails?.billing_event || sourceAdset.billingEvent,
      bidStrategy: facebookDetails?.bid_strategy || sourceAdset.bidStrategy,
      bidAmount: facebookDetails?.bid_amount || sourceAdset.bidAmount,
      promotedObject: facebookDetails?.promoted_object 
        ? JSON.parse(JSON.stringify(facebookDetails.promoted_object))
        : sourceAdset.promotedObject 
          ? JSON.parse(JSON.stringify(sourceAdset.promotedObject))
          : undefined,
      attributionSpec: facebookDetails?.attribution_spec 
        ? JSON.parse(JSON.stringify(facebookDetails.attribution_spec))
        : sourceAdset.attributionSpec 
          ? JSON.parse(JSON.stringify(sourceAdset.attributionSpec))
          : undefined,
      // conversion_specs is not available on AdSet API - conversion info is in promoted_object
      conversionSpecs: sourceAdset.conversionSpecs 
        ? JSON.parse(JSON.stringify(sourceAdset.conversionSpecs))
        : undefined,
      dailyBudget: facebookDetails?.daily_budget 
        ? facebookDetails.daily_budget / 100 
        : sourceAdset.dailyBudget || sourceAdset.budget,
      lifetimeBudget: facebookDetails?.lifetime_budget 
        ? facebookDetails.lifetime_budget / 100 
        : sourceAdset.lifetimeBudget,
      startTime: facebookDetails?.start_time || sourceAdset.startTime,
      endTime: facebookDetails?.end_time || sourceAdset.endTime,
    });

    await duplicatedAdset.save();

    res.status(201).json(duplicatedAdset);
  } catch (error: any) {
    console.error('Duplicate adset error:', error);
    res.status(500).json({ error: error.message || 'Failed to duplicate adset' });
  }
};

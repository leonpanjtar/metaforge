import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { Adset } from '../models/Adset';
import { Campaign } from '../models/Campaign';
import { Asset } from '../models/Asset';
import { AdCopy } from '../models/AdCopy';
import { AdCombination } from '../models/AdCombination';
import { FileStorageService } from '../services/storage/FileStorageService';
import { getAccountFilter, getAccountUserIds } from '../utils/accountFilter';

export const createAdset = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { campaignId, name, targeting, budget, schedule, optimizationGoal, billingEvent, bidStrategy, bidAmount, promotedObject, attributionSpec, conversionSpecs, dailyBudget, lifetimeBudget, startTime, endTime } = req.body;

    if (!campaignId || !name || !targeting || budget === undefined) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Get account filter
    const accountFilter = await getAccountFilter(req);
    
    // Get all user IDs in the current account
    const accountUserIds = await getAccountUserIds(req);

    const campaign = await Campaign.findOne({
      _id: campaignId,
      userId: { $in: accountUserIds },
    });

    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const adset = new Adset({
      userId: req.userId,
      accountId: accountFilter.accountId,
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
      createdByApp: true, // Mark as created by the app
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

    // Get account filter - query by accountId first, then fallback to userId
    const accountFilter = await getAccountFilter(req);
    
    const query: any = {};
    
    // Query by accountId if available, otherwise fallback to userId for backward compatibility
    if (accountFilter.accountId) {
      query.accountId = new mongoose.Types.ObjectId(accountFilter.accountId);
    } else {
      // Fallback to userId for backward compatibility
      query.userId = new mongoose.Types.ObjectId(accountFilter.userId);
    }
    
    if (campaignId) {
      // Convert campaignId string to ObjectId
      try {
        query.campaignId = new mongoose.Types.ObjectId(campaignId as string);
      } catch (error) {
        res.status(400).json({ error: 'Invalid campaignId format' });
        return;
      }
    }

    const adsets = await Adset.find(query)
      .populate('campaignId', 'name')
      .sort({ createdAt: -1 });

    res.json(adsets);
  } catch (error: any) {
    console.error('Get adsets error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch adsets' });
  }
};

export const getAdset = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Get all user IDs in the current account
    const accountUserIds = await getAccountUserIds(req);

    const adset = await Adset.findOne({
      _id: id,
      userId: { $in: accountUserIds },
    }).populate('campaignId', 'name');

    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    res.json(adset);
  } catch (error: any) {
    console.error('Get adset error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch adset' });
  }
};

export const syncAdsetFromFacebook = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Get account filter to check adset access
    const accountFilter = await getAccountFilter(req);
    
    // Get all user IDs in the current account (as ObjectIds)
    const { getAccountUserObjectIds } = await import('../utils/accountFilter');
    const accountUserObjectIds = await getAccountUserObjectIds(req);

    // Build adset query - check by accountId first, then fallback to userId
    const adsetQuery: any = { _id: id };
    
    if (accountFilter.accountId) {
      adsetQuery.accountId = new mongoose.Types.ObjectId(accountFilter.accountId);
    } else {
      // Fallback to userId for backward compatibility
      adsetQuery.userId = { $in: accountUserObjectIds };
    }

    const adset = await Adset.findOne(adsetQuery).populate('campaignId');

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

    const FacebookCacheServiceModule = await import('../services/facebook/FacebookCacheService');
    const { TokenRefreshService } = await import('../services/facebook/TokenRefreshService');
    
    await TokenRefreshService.checkAndRefreshToken(facebookAccount);
    const apiService = new FacebookCacheServiceModule.FacebookCacheService(facebookAccount.accessToken);
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

    // Update targeting if available - preserve all fields including custom audiences
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
      // Preserve custom audiences / saved audiences
      if (facebookDetails.targeting.custom_audiences) {
        (adset.targeting as any).customAudiences = JSON.parse(JSON.stringify(facebookDetails.targeting.custom_audiences));
      }
      // Preserve any other targeting fields
      Object.keys(facebookDetails.targeting).forEach((key) => {
        if (!['age_min', 'age_max', 'genders', 'geo_locations', 'interests'].includes(key)) {
          if (key === 'custom_audiences') {
            (adset.targeting as any).customAudiences = JSON.parse(JSON.stringify(facebookDetails.targeting[key]));
          } else {
            (adset.targeting as any)[key] = facebookDetails.targeting[key];
          }
        }
      });
    }

    await adset.save();

    // Invalidate adset details cache after sync
    apiService.invalidate(`adsetDetails:${adset.facebookAdsetId}`);
    apiService.invalidate('adsets:');

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

    // Get account filter to check adset access
    const accountFilter = await getAccountFilter(req);
    
    // Get all user IDs in the current account (as ObjectIds)
    const { getAccountUserObjectIds } = await import('../utils/accountFilter');
    const accountUserObjectIds = await getAccountUserObjectIds(req);

    // Build adset query - check by accountId first, then fallback to userId
    const adsetQuery: any = { _id: id };
    
    if (accountFilter.accountId) {
      adsetQuery.accountId = new mongoose.Types.ObjectId(accountFilter.accountId);
    } else {
      // Fallback to userId for backward compatibility
      adsetQuery.userId = { $in: accountUserObjectIds };
    }

    // Handle contentData updates separately to merge properly
    if (updates.contentData) {
      const adset = await Adset.findOne(adsetQuery);
      if (!adset) {
        res.status(404).json({ error: 'Adset not found' });
        return;
      }
      
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
      
      // Remove contentData from updates to avoid overwriting
      delete updates.contentData;
      
      // Use updateOne with $set to force save all fields including empty strings
      await Adset.updateOne(
        adsetQuery,
        {
          $set: {
            contentData: newContentData,
            ...updates,
          },
        }
      );
      
      // Fetch updated adset
      const updatedAdset = await Adset.findOne(adsetQuery);
      
      if (!updatedAdset) {
        res.status(404).json({ error: 'Adset not found after update' });
        return;
      }
      
      res.json(updatedAdset);
    } else {
      const adset = await Adset.findOneAndUpdate(
        adsetQuery,
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

    // Get account filter to check adset access
    const accountFilter = await getAccountFilter(req);
    
    // Get all user IDs in the current account (as ObjectIds)
    const { getAccountUserObjectIds } = await import('../utils/accountFilter');
    const accountUserObjectIds = await getAccountUserObjectIds(req);

    // Build adset query - check by accountId first, then fallback to userId
    const adsetQuery: any = {};
    
    if (accountFilter.accountId) {
      adsetQuery.accountId = new mongoose.Types.ObjectId(accountFilter.accountId);
    } else {
      // Fallback to userId for backward compatibility
      adsetQuery.userId = { $in: accountUserObjectIds };
    }

    // Find target adset
    const targetAdset = await Adset.findOne({
      _id: id,
      ...adsetQuery,
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
      ...adsetQuery,
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
          const FacebookCacheServiceModule = await import('../services/facebook/FacebookCacheService');
          const { TokenRefreshService } = await import('../services/facebook/TokenRefreshService');
          
          await TokenRefreshService.checkAndRefreshToken(facebookAccount);
          const apiService = new FacebookCacheServiceModule.FacebookCacheService(facebookAccount.accessToken);
          facebookDetails = await apiService.getAdsetDetails(sourceAdset.facebookAdsetId);
        }
      } catch (error: any) {
        // Continue with local data if Facebook fetch fails
      }
    }

    // Copy all settings to target adset - preserve all targeting fields including custom audiences
    const targetingCopy: any = {
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
    };

    // Copy custom audiences / saved audiences if present
    if (facebookDetails?.targeting?.custom_audiences) {
      targetingCopy.customAudiences = JSON.parse(JSON.stringify(facebookDetails.targeting.custom_audiences));
    } else if (sourceAdset.targeting.customAudiences) {
      targetingCopy.customAudiences = JSON.parse(JSON.stringify(sourceAdset.targeting.customAudiences));
    }

    // Copy any other targeting fields that might exist
    if (sourceAdset.targeting) {
      Object.keys(sourceAdset.targeting).forEach((key) => {
        if (!targetingCopy.hasOwnProperty(key)) {
          targetingCopy[key] = (sourceAdset.targeting as any)[key];
        }
      });
    }

    targetAdset.targeting = targetingCopy;
    
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

    // Get account filter to check adset access
    const accountFilter = await getAccountFilter(req);
    
    // Get all user IDs in the current account (as ObjectIds)
    const { getAccountUserObjectIds } = await import('../utils/accountFilter');
    const accountUserObjectIds = await getAccountUserObjectIds(req);

    // Build adset query - check by accountId first, then fallback to userId
    const adsetQuery: any = { _id: id };
    
    if (accountFilter.accountId) {
      adsetQuery.accountId = new mongoose.Types.ObjectId(accountFilter.accountId);
    } else {
      // Fallback to userId for backward compatibility
      adsetQuery.userId = { $in: accountUserObjectIds };
    }

    // Find the adset first to check conditions
    const adset = await Adset.findOne(adsetQuery);

    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    // Only allow deletion if not published to Facebook
    // Consider adsets without facebookAdsetId as app-created (not synced/live on FB)
    if (adset.facebookAdsetId) {
      res.status(403).json({ error: 'Cannot delete adsets that have been published to Facebook' });
      return;
    }

    // Count items before deletion for response
    const assetsCount = await Asset.countDocuments({ adsetId: id });
    const copiesCount = await AdCopy.countDocuments({ adsetId: id });
    const combinationsCount = await AdCombination.countDocuments({ adsetId: id });

    // Delete all assets associated with this adset
    const assets = await Asset.find({ adsetId: id });
    const fileStorageService = new FileStorageService();
    
    for (const asset of assets) {
      try {
        // Delete the asset file from filesystem
        await fileStorageService.deleteFile(asset.filepath);
      } catch (error: any) {
        console.warn(`Failed to delete asset file ${asset.filepath}:`, error.message);
        // Continue even if file deletion fails
      }
    }
    
    // Delete all assets from database
    await Asset.deleteMany({ adsetId: id });

    // Delete all ad copies associated with this adset
    await AdCopy.deleteMany({ adsetId: id });

    // Delete all combinations associated with this adset
    await AdCombination.deleteMany({ adsetId: id });

    // Finally, delete the adset itself
    await Adset.findByIdAndDelete(id);

    res.json({ 
      success: true,
      deleted: {
        assets: assetsCount,
        copies: copiesCount,
        combinations: combinationsCount,
      }
    });
  } catch (error: any) {
    console.error('Delete adset error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete adset' });
  }
};

export const duplicateAdset = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, campaignId } = req.body;

    // Get account filter (for setting on new adset, not for querying)
    const accountFilter = await getAccountFilter(req);
    
    // Get all user IDs in the current account (as ObjectIds)
    const { getAccountUserObjectIds } = await import('../utils/accountFilter');
    const accountUserObjectIds = await getAccountUserObjectIds(req);

    // Build adset query - check by accountId first, then fallback to userId
    const adsetQuery: any = { _id: id };
    
    if (accountFilter.accountId) {
      adsetQuery.accountId = new mongoose.Types.ObjectId(accountFilter.accountId);
    } else {
      // Fallback to userId for backward compatibility
      adsetQuery.userId = { $in: accountUserObjectIds };
    }

    // Find the source adset
    const sourceAdset = await Adset.findOne(adsetQuery).populate('campaignId');

    if (!sourceAdset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    // Use provided campaignId or keep the same campaign
    const targetCampaignId = campaignId || (sourceAdset.campaignId as any)._id;

    // Verify the target campaign belongs to any user in the account
    const campaign = await Campaign.findOne({
      _id: targetCampaignId,
      userId: { $in: accountUserObjectIds },
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
          const FacebookCacheServiceModule = await import('../services/facebook/FacebookCacheService');
          const { TokenRefreshService } = await import('../services/facebook/TokenRefreshService');
          
          await TokenRefreshService.checkAndRefreshToken(facebookAccount);
          const apiService = new FacebookCacheServiceModule.FacebookCacheService(facebookAccount.accessToken);
          facebookDetails = await apiService.getAdsetDetails(sourceAdset.facebookAdsetId);
        }
      } catch (error: any) {
        console.warn('Could not fetch Facebook adset details:', error.message);
        // Continue with local data if Facebook fetch fails
      }
    }

    // Create duplicate adset with ALL settings - deep copy everything
    // Deep copy targeting - preserve all fields including custom audiences
    const targetingCopy: any = {
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
    };

    // Copy custom audiences / saved audiences if present
    if (facebookDetails?.targeting?.custom_audiences) {
      targetingCopy.customAudiences = JSON.parse(JSON.stringify(facebookDetails.targeting.custom_audiences));
    } else if (sourceAdset.targeting.customAudiences) {
      targetingCopy.customAudiences = JSON.parse(JSON.stringify(sourceAdset.targeting.customAudiences));
    }

    // Copy any other targeting fields that might exist (flexible schema)
    if (sourceAdset.targeting) {
      Object.keys(sourceAdset.targeting).forEach((key) => {
        if (!targetingCopy.hasOwnProperty(key)) {
          targetingCopy[key] = (sourceAdset.targeting as any)[key];
        }
      });
    }

    const duplicatedAdset = new Adset({
      userId: req.userId,
      accountId: accountFilter.accountId,
      campaignId: targetCampaignId,
      name: newName,
      targeting: targetingCopy,
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
      createdByApp: true, // Duplicated adsets are also created by the app
    });

    await duplicatedAdset.save();

    res.status(201).json(duplicatedAdset);
  } catch (error: any) {
    console.error('Duplicate adset error:', error);
    res.status(500).json({ error: error.message || 'Failed to duplicate adset' });
  }
};

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { FacebookAccount } from '../models/FacebookAccount';
import { FacebookApiService } from '../services/facebook/FacebookApiService';
import { Campaign } from '../models/Campaign';
import { Adset } from '../models/Adset';
import { AdCombination } from '../models/AdCombination';
import { Asset } from '../models/Asset';
import { AdCopy } from '../models/AdCopy';
import { WinningAdsCache } from '../models/WinningAdsCache';
import { getAccountFilter } from '../utils/accountFilter';
import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';

// Helper to extract lead outcomes (OUTCOME_LEADS) from Facebook insights
function extractLeadOutcomes(insights: any): number {
  // 1) Some accounts expose a generic `results` field when objective = OUTCOME_LEADS
  //    In that case, `results` already represents the number of leads.
  const genericResults = Number(insights?.results ?? 0);
  if (!Number.isNaN(genericResults) && genericResults > 0) {
    return genericResults;
  }

  // 2) Some responses may include `objective_results` with per-objective breakdown
  const objectiveResults = insights?.objective_results;
  if (Array.isArray(objectiveResults)) {
    let total = 0;
    for (const obj of objectiveResults) {
      const name = (obj.name || obj.objective || '').toString().toLowerCase();
      if (name.includes('lead')) {
        const value = Number(obj.value || 0);
        if (!Number.isNaN(value)) {
          total += value;
        }
      }
    }
    if (total > 0) {
      return total;
    }
  }

  // 3) Fallback: look at actions with type containing 'lead'
  const actions = insights?.actions;
  if (Array.isArray(actions)) {
    let total = 0;
    for (const action of actions) {
      const type = (action.action_type || '').toString().toLowerCase();
      if (type.includes('lead')) {
        const value = Number(action.value || 0);
        if (!Number.isNaN(value)) {
          total += value;
        }
      }
    }
    return total;
  }

  return 0;
}

// Helper to extract schedules from conversions:schedule_website
// Uses the detailed results array with indicators
function extractSchedules(insights: any): { count: number; costPerResult: number; conversionRate: number } {
  let total = 0;
  let costPerResult = 0;
  let conversionRate = 0;
  
  // Parse results array to find conversions:schedule_website
  const results = insights?.results;
  if (Array.isArray(results)) {
    for (const result of results) {
      const indicator = (result.indicator || '').toString();
      const values = result.values || [];
      
      // Look specifically for conversions:schedule_website
      if (indicator === 'conversions:schedule_website' || indicator.includes('conversions:schedule_website')) {
        // Sum all values for this indicator
        for (const val of values) {
          const value = Number(val.value || 0);
          if (!Number.isNaN(value) && value > 0) {
            total += value;
          }
        }
      }
    }
  }
  
  // Parse cost_per_result array to get cost per conversion for schedule_website
  const costPerResultArray = insights?.cost_per_result;
  if (Array.isArray(costPerResultArray)) {
    for (const costResult of costPerResultArray) {
      const indicator = (costResult.indicator || '').toString();
      const values = costResult.values || [];
      
      if (indicator === 'conversions:schedule_website' || indicator.includes('conversions:schedule_website')) {
        // Get the first value (usually there's only one)
        if (values.length > 0) {
          const costValue = Number(values[0].value || 0);
          if (!Number.isNaN(costValue) && costValue > 0) {
            costPerResult = costValue;
          }
        }
      }
    }
  }
  
  // Parse result_rate array to get conversion rate for schedule_website
  const resultRateArray = insights?.result_rate;
  if (Array.isArray(resultRateArray)) {
    for (const rateResult of resultRateArray) {
      const indicator = (rateResult.indicator || '').toString();
      const values = rateResult.values || [];
      
      if (indicator === 'conversions:schedule_website' || indicator.includes('conversions:schedule_website')) {
        // Get the first value (conversion rate as decimal, e.g., 0.08340284)
        if (values.length > 0) {
          const rateValue = Number(values[0].value || 0);
          if (!Number.isNaN(rateValue) && rateValue > 0) {
            conversionRate = rateValue;
          }
        }
      }
    }
  }
  
  return { count: total, costPerResult, conversionRate };
}

// Helper to extract all conversion events from Facebook insights
function extractConversionEvents(insights: any): Array<{ actionType: string; value: number }> {
  const events: Array<{ actionType: string; value: number }> = [];
  
  // List of non-conversion actions to exclude
  const excludedActions = [
    'link_click',
    'post_engagement',
    'page_engagement',
    'post_reaction',
    'post_comment',
    'post_share',
    'video_view',
    'photo_view',
    'landing_page_view',
    'onsite_conversion',
    'offsite_conversion.fb_pixel', // Generic pixel tracking, not specific conversions
  ];
  
  // List of known conversion event patterns (standard and custom)
  const conversionPatterns = [
    'lead',
    'purchase',
    'schedule', // Standard Schedule event
    'appointment', // Appointments scheduled
    'appointments_scheduled',
    'appointment_scheduled',
    'schedule_appointment',
    'book_appointment',
    'add_to_cart',
    'initiate_checkout',
    'complete_registration',
    'find_location',
    'contact',
    'customize_product',
    'donate',
    'offsite_conversion.custom', // Custom conversions
    'offsite_conversion.fb_pixel_custom', // Custom pixel events
  ];
  
  const actions = insights?.actions;
  if (Array.isArray(actions)) {
    for (const action of actions) {
      const actionType = (action.action_type || '').toString().toLowerCase();
      const value = Number(action.value || 0);
      
      if (Number.isNaN(value) || value <= 0 || !actionType) {
        continue;
      }
      
      // Check if it's an excluded action
      const isExcluded = excludedActions.some((excluded) => actionType.includes(excluded));
      if (isExcluded) {
        continue;
      }
      
      // Check if it matches a conversion pattern OR starts with offsite_conversion
      const isConversion = 
        conversionPatterns.some((pattern) => actionType.includes(pattern)) ||
        actionType.startsWith('offsite_conversion') ||
        actionType.startsWith('onsite_conversion');
      
      if (isConversion) {
        // Use original action_type (not lowercased) for display
        const originalActionType = (action.action_type || '').toString();
        events.push({
          actionType: originalActionType,
          value,
        });
      }
    }
  }
  
  // Also check objective_results for conversion events
  const objectiveResults = insights?.objective_results;
  if (Array.isArray(objectiveResults)) {
    for (const obj of objectiveResults) {
      const name = (obj.name || obj.objective || '').toString();
      const value = Number(obj.value || 0);
      if (!Number.isNaN(value) && value > 0 && name) {
        // Check if we already have this event from actions
        const exists = events.some((e) => 
          e.actionType.toLowerCase() === name.toLowerCase() ||
          e.actionType.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(e.actionType.toLowerCase())
        );
        if (!exists) {
          events.push({
            actionType: name,
            value,
          });
        }
      }
    }
  }
  
  return events;
}

export const getWinningAds = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      since,
      until,
      sortBy,
      sortDir,
      minSchedules,
      maxSchedules,
      minSpend,
      maxSpend,
      minCps,
      maxCps,
      minClicks,
      maxClicks,
      minImpressions,
      maxImpressions,
      forceRefresh,
    } = req.query as any;

    const endDate = until ? new Date(until) : new Date();
    const startDate = since ? new Date(since) : new Date(endDate);
    if (!since) {
      // default to last 3 months from today
      startDate.setMonth(endDate.getMonth() - 3);
    }

    const sinceStr = startDate.toISOString().split('T')[0];
    const untilStr = endDate.toISOString().split('T')[0];
    const dateRange = {
      since: sinceStr,
      until: untilStr,
    };

    // Find an active Facebook account for any user in the account
    const { getAccountUserIds } = await import('../utils/accountFilter');
    const accountUserIds = await getAccountUserIds(req);
    
    const facebookAccount =
      (await FacebookAccount.findOne({ userId: { $in: accountUserIds }, isActive: true })) ||
      (await FacebookAccount.findOne({ userId: { $in: accountUserIds } }));
    if (!facebookAccount) {
      res.status(400).json({ error: 'Facebook account not found for user' });
      return;
    }

    // Try cache first (valid for 1 hour), unless forceRefresh is true
    const shouldForceRefresh = forceRefresh === 'true' || forceRefresh === true;
    let cache = null;
    
    if (!shouldForceRefresh) {
      cache = await WinningAdsCache.findOne({
        userId: req.userId,
        facebookAccountId: facebookAccount._id,
        since: sinceStr,
        until: untilStr,
      });
    }

    const ONE_HOUR_MS = 60 * 60 * 1000;
    const now = Date.now();

    let results: any[] = [];

    if (!shouldForceRefresh && cache && now - cache.updatedAt.getTime() < ONE_HOUR_MS) {
      results = cache.ads;
    } else {

      const apiService = new FacebookApiService(facebookAccount.accessToken);
      const accountIdWithPrefix = facebookAccount.accountId.startsWith('act_')
        ? facebookAccount.accountId
        : `act_${facebookAccount.accountId}`;

      results = [];

      // Use account-level insights API with action_type=schedule_website filter
      // This is the correct way to fetch winning ads data
      try {
        const rows = await apiService.getAccountAdInsights(accountIdWithPrefix, dateRange);

        for (const row of rows) {
          const adId = row.ad_id;
          const impressions = Number(row.impressions || 0);
          const clicks = Number(row.clicks || 0);
          const spend = Number(row.spend || 0);
          
          // Extract schedule_website conversions from actions array
          // The API returns actions with action_type breakdown when action_breakdowns=action_type
          let schedules = 0;
          let costPerSchedule = 0;
          let conversionRate = 0;
          
          // Check actions array for schedule_website
          if (Array.isArray(row.actions)) {
            const scheduleAction = row.actions.find((a: any) => 
              a.action_type === 'schedule_website' || 
              (a.action_type && a.action_type.toLowerCase().includes('schedule'))
            );
            if (scheduleAction) {
              schedules = Number(scheduleAction.value || 0);
            }
          }
          
          // Check conversions array (alternative format)
          if (Array.isArray(row.conversions)) {
            const scheduleConversion = row.conversions.find((c: any) => 
              c.action_type === 'schedule_website' || 
              (c.action_type && c.action_type.toLowerCase().includes('schedule'))
            );
            if (scheduleConversion) {
              schedules = Number(scheduleConversion.value || schedules);
            }
          }
          
          // Get cost per action from cost_per_action_type
          if (Array.isArray(row.cost_per_action_type)) {
            const scheduleCost = row.cost_per_action_type.find((c: any) => 
              c.action_type === 'schedule_website' || 
              (c.action_type && c.action_type.toLowerCase().includes('schedule'))
            );
            if (scheduleCost) {
              costPerSchedule = Number(scheduleCost.value || 0);
            }
          }
          
          // Calculate cost per schedule if not provided
          if (costPerSchedule === 0 && schedules > 0 && spend > 0) {
            costPerSchedule = spend / schedules;
          }
          
          // Calculate conversion rate (schedules / clicks)
          if (clicks > 0 && schedules > 0) {
            conversionRate = (schedules / clicks) * 100;
          }
          
          // Only include ads with schedules > 0
          if (schedules > 0) {
            const accountIdNumeric = facebookAccount.accountId.startsWith('act_')
              ? facebookAccount.accountId.replace('act_', '')
              : facebookAccount.accountId;
            const facebookAdLink = `https://www.facebook.com/adsmanager/manage/ads?act=${accountIdNumeric}&selected_ad_ids[0]=${adId}`;

            results.push({
              combinationId: adId,
              facebookAdId: adId,
              adsetId: row.adset_id || '',
              campaignName: row.campaign_name || '',
              adsetName: row.adset_name || '',
              adName: row.ad_name || '',
              impressions,
              clicks,
              spend,
              schedules,
              costPerSchedule,
              conversionRate,
              score: 0, // Will be calculated after all ads are collected
              url: '',
              facebookAdLink,
              conversionEvents: extractConversionEvents(row),
            });
          }
        }
      } catch (error: any) {
        console.error('[getWinningAds] Failed to fetch account insights:', error);
        throw error;
      }

      // Upsert cache
      await WinningAdsCache.findOneAndUpdate(
        {
          userId: req.userId,
          facebookAccountId: facebookAccount._id,
          since: sinceStr,
          until: untilStr,
        },
        {
          $set: {
            ads: results,
          },
        },
        { upsert: true, new: true }
      );
    }

    // Calculate relative scores for all ads (both fresh and cached)
    // Score based on: schedules (higher is better), costPerSchedule (lower is better), conversionRate (higher is better), spend (higher = more data)
    if (results.length > 0) {
      // Find min/max for normalization
      const schedulesValues = results.map((ad) => ad.schedules || 0).filter((v) => v > 0);
      const costPerScheduleValues = results.map((ad) => ad.costPerSchedule || 0).filter((v) => v > 0);
      const conversionRateValues = results.map((ad) => ad.conversionRate || 0).filter((v) => v > 0);
      const spendValues = results.map((ad) => ad.spend || 0).filter((v) => v > 0);

      const maxSchedules = schedulesValues.length > 0 ? Math.max(...schedulesValues) : 1;
      const minCostPerSchedule = costPerScheduleValues.length > 0 ? Math.min(...costPerScheduleValues) : 1;
      const maxCostPerSchedule = costPerScheduleValues.length > 0 ? Math.max(...costPerScheduleValues) : 1;
      const maxConversionRate = conversionRateValues.length > 0 ? Math.max(...conversionRateValues) : 1;
      const maxSpend = spendValues.length > 0 ? Math.max(...spendValues) : 1;

      // Calculate score for each ad (0-100 scale)
      for (const ad of results) {
        const schedules = ad.schedules || 0;
        const costPerSchedule = ad.costPerSchedule || 0;
        const conversionRate = ad.conversionRate || 0;
        const spend = ad.spend || 0;

        // Normalize each metric (0-1 scale)
        const schedulesScore = maxSchedules > 0 ? schedules / maxSchedules : 0;
        // For cost per schedule, invert (lower is better) - normalize to 0-1 where 1 = best (lowest cost)
        const costPerScheduleScore =
          maxCostPerSchedule > minCostPerSchedule && costPerSchedule > 0
            ? 1 - (costPerSchedule - minCostPerSchedule) / (maxCostPerSchedule - minCostPerSchedule)
            : costPerSchedule > 0
            ? 0
            : 0;
        const conversionRateScore = maxConversionRate > 0 ? conversionRate / maxConversionRate : 0;
        // Spend score (higher spend = more data, but normalize to not dominate)
        const spendScore = maxSpend > 0 ? Math.min(spend / maxSpend, 1) : 0;

        // Weighted combination (you can adjust weights)
        // Higher weight on schedules and conversion rate, moderate on cost efficiency, lower on spend
        const overallScore =
          schedulesScore * 0.4 + // 40% weight on schedules
          costPerScheduleScore * 0.3 + // 30% weight on cost efficiency
          conversionRateScore * 0.25 + // 25% weight on conversion rate
          spendScore * 0.05; // 5% weight on spend (data volume)

        ad.score = overallScore * 100; // Scale to 0-100
      }
    }

    // Apply filters
    const parsed = {
      minSchedules: minSchedules !== undefined ? Number(minSchedules) : undefined,
      maxSchedules: maxSchedules !== undefined ? Number(maxSchedules) : undefined,
      minSpend: minSpend !== undefined ? Number(minSpend) : undefined,
      maxSpend: maxSpend !== undefined ? Number(maxSpend) : undefined,
      minCps: minCps !== undefined ? Number(minCps) : undefined,
      maxCps: maxCps !== undefined ? Number(maxCps) : undefined,
      minClicks: minClicks !== undefined ? Number(minClicks) : undefined,
      maxClicks: maxClicks !== undefined ? Number(maxClicks) : undefined,
      minImpressions: minImpressions !== undefined ? Number(minImpressions) : undefined,
      maxImpressions: maxImpressions !== undefined ? Number(maxImpressions) : undefined,
    };

    let filtered = results.filter((ad) => {
      if (parsed.minSchedules !== undefined && (ad.schedules || 0) < parsed.minSchedules) return false;
      if (parsed.maxSchedules !== undefined && (ad.schedules || 0) > parsed.maxSchedules) return false;
      if (parsed.minSpend !== undefined && ad.spend < parsed.minSpend) return false;
      if (parsed.maxSpend !== undefined && ad.spend > parsed.maxSpend) return false;
      if (parsed.minCps !== undefined && (ad.costPerSchedule || 0) < parsed.minCps) return false;
      if (parsed.maxCps !== undefined && (ad.costPerSchedule || 0) > parsed.maxCps) return false;
      if (parsed.minClicks !== undefined && ad.clicks < parsed.minClicks) return false;
      if (parsed.maxClicks !== undefined && ad.clicks > parsed.maxClicks) return false;
      if (parsed.minImpressions !== undefined && ad.impressions < parsed.minImpressions)
        return false;
      if (parsed.maxImpressions !== undefined && ad.impressions > parsed.maxImpressions)
        return false;
      return true;
    });

    // Sorting - default: score descending, then schedules descending
    const sortField = (sortBy as string) || 'score';
    const sortDirection = (sortDir as string) === 'asc' ? 'asc' : 'desc';

    filtered.sort((a, b) => {
      const getVal = (obj: any) => {
        switch (sortField) {
          case 'spend':
            return obj.spend;
          case 'costPerSchedule':
            return obj.costPerSchedule || 0;
          case 'clicks':
            return obj.clicks;
          case 'impressions':
            return obj.impressions;
          case 'conversionRate':
            return obj.conversionRate || 0;
          case 'schedules':
            return obj.schedules || 0;
          case 'score':
          default:
            return obj.score || 0;
        }
      };

      const av = getVal(a);
      const bv = getVal(b);

      if (av === bv) {
        // Secondary sort: schedules descending when score equal
        if (sortField === 'score') {
          return (b.schedules || 0) - (a.schedules || 0);
        }
        return 0;
      }

      if (sortDirection === 'asc') {
        return av - bv;
      }
      return bv - av;
    });

    res.json({ ads: filtered });
  } catch (error: any) {
    console.error('getWinningAds error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch winning ads' });
  }
};

export const getAdDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { facebookAdId } = req.params;

    // Find an active Facebook account for any user in the account
    const { getAccountUserObjectIds } = await import('../utils/accountFilter');
    const accountUserObjectIds = await getAccountUserObjectIds(req);
    
    const facebookAccount =
      (await FacebookAccount.findOne({ userId: { $in: accountUserObjectIds }, isActive: true })) ||
      (await FacebookAccount.findOne({ userId: { $in: accountUserObjectIds } }));
    
    if (!facebookAccount) {
      res.status(404).json({ error: 'Facebook account not found' });
      return;
    }

    // Check and refresh token if needed
    const { TokenRefreshService } = await import('../services/facebook/TokenRefreshService');
    await TokenRefreshService.checkAndRefreshToken(facebookAccount);

    const apiService = new FacebookApiService(facebookAccount.accessToken);

    // Get ad details directly from Facebook API
    // Note: This works for any ad in the account, not just ads created through the app
    const adDetails = await apiService.getAdDetails(facebookAdId);
    
    // Get adset targeting
    const adsetDetails = await apiService.getAdsetDetails(adDetails.adset_id);
    
    // Initialize creative data with defaults
    let headline = '';
    let body = '';
    let description = '';
    let ctaButton = 'LEARN_MORE';
    let imageHash: string | null = null;
    let imageUrl: string | null = null;
    let link = '';

    // Extract data from object_story_spec (it's already included in ad details response)
    const objectStorySpec = adDetails.creative?.object_story_spec;
    
    if (objectStorySpec) {
      const linkData = objectStorySpec.link_data || {};
      const videoData = objectStorySpec.video_data || {};
      
      // Link ad format
      if (linkData && Object.keys(linkData).length > 0) {
        headline = linkData.name || '';
        body = linkData.message || '';
        description = linkData.description || '';
        link = linkData.link || '';
        if (linkData.image_hash) imageHash = linkData.image_hash;
        if (linkData.call_to_action?.type) ctaButton = linkData.call_to_action.type;
      }
      
      // Video ad format
      if (videoData && Object.keys(videoData).length > 0) {
        headline = videoData.title || videoData.name || '';
        body = videoData.message || '';
        description = videoData.description || '';
        link = videoData.call_to_action?.value?.link || '';
        if (videoData.image_url) imageUrl = videoData.image_url;
        if (videoData.image_hash) imageHash = videoData.image_hash;
        if (videoData.call_to_action?.type) ctaButton = videoData.call_to_action.type;
      }
    } else {
      // Fallback: try to fetch creative details if object_story_spec is not in ad details
      const creativeId = adDetails.creative?.id;
      if (creativeId) {
        try {
          const creativeDetails = await apiService.getAdCreativeDetails(creativeId);
          
          const fallbackObjectStorySpec = creativeDetails.object_story_spec;
          if (fallbackObjectStorySpec) {
            const linkData = fallbackObjectStorySpec.link_data || {};
            const videoData = fallbackObjectStorySpec.video_data || {};
            
            if (linkData && Object.keys(linkData).length > 0) {
              headline = linkData.name || '';
              body = linkData.message || '';
              description = linkData.description || '';
              link = linkData.link || '';
              if (linkData.image_hash) imageHash = linkData.image_hash;
              if (linkData.call_to_action?.type) ctaButton = linkData.call_to_action.type;
            }
            
            if (videoData && Object.keys(videoData).length > 0) {
              headline = videoData.title || videoData.name || '';
              body = videoData.message || '';
              description = videoData.description || '';
              link = videoData.call_to_action?.value?.link || '';
              if (videoData.image_url) imageUrl = videoData.image_url;
              if (videoData.image_hash) imageHash = videoData.image_hash;
              if (videoData.call_to_action?.type) ctaButton = videoData.call_to_action.type;
            }
          }
        } catch (creativeError: any) {
          console.warn('[getAdDetails] Failed to fetch creative details (non-critical):', creativeError.message);
        }
      }
    }

    // Build image URL from hash if we have hash but no URL
    if (imageHash && !imageUrl) {
      imageUrl = `https://graph.facebook.com/v24.0/${imageHash}`;
    }

    // Build response
    const details = {
      creative: {
        headline,
        body,
        description,
        ctaButton,
        imageHash,
        imageUrl,
        link,
      },
      adsetTargeting: {
        ageMin: adsetDetails.targeting?.age_min,
        ageMax: adsetDetails.targeting?.age_max,
        genders: adsetDetails.targeting?.genders,
        locations: adsetDetails.targeting?.geo_locations?.countries || [],
        interests: adsetDetails.targeting?.interests?.map((i: any) => i.name || i) || [],
        behaviors: adsetDetails.targeting?.behaviors?.map((b: any) => b.name || b) || [],
        placements: adsetDetails.targeting?.publisher_platforms || [],
      },
    };

    res.json(details);
  } catch (error: any) {
    console.error('getAdDetails error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch ad details' });
  }
};

export const createAdsetFromWinningAd = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { facebookAdId, campaignId, adsetName } = req.body;

    if (!facebookAdId || !campaignId || !adsetName) {
      res.status(400).json({ error: 'facebookAdId, campaignId, and adsetName are required' });
      return;
    }

    // Get account filter
    const accountFilter = await getAccountFilter(req);

    // Verify campaign belongs to user and account
    const campaign = await Campaign.findOne({
      _id: campaignId,
      userId: req.userId,
      ...(accountFilter.accountId ? { accountId: accountFilter.accountId } : {}),
    });
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found or access denied' });
      return;
    }

    // Get Facebook account
    const facebookAccount = await FacebookAccount.findById(campaign.facebookAccountId);
    if (!facebookAccount) {
      res.status(404).json({ error: 'Facebook account not found' });
      return;
    }

    const apiService = new FacebookApiService(facebookAccount.accessToken);

    // Get ad details and creative
    const adDetails = await apiService.getAdDetails(facebookAdId);
    const creativeId = adDetails.creative?.id;
    if (!creativeId) {
      res.status(400).json({ error: 'Creative ID not found' });
      return;
    }

    const creativeDetails = await apiService.getAdCreativeDetails(creativeId);
    const linkData = creativeDetails.object_story_spec?.link_data || {};
    const adsetDetails = await apiService.getAdsetDetails(adDetails.adset_id);

    // Create new adset
    const newAdset = new Adset({
      userId: req.userId,
      accountId: accountFilter.accountId,
      campaignId: campaign._id,
      name: adsetName,
      targeting: {
        ageMin: adsetDetails.targeting?.age_min,
        ageMax: adsetDetails.targeting?.age_max,
        genders: adsetDetails.targeting?.genders,
        geoLocations: adsetDetails.targeting?.geo_locations || {},
        interests: adsetDetails.targeting?.interests || [],
        behaviors: adsetDetails.targeting?.behaviors || [],
        publisherPlatforms: adsetDetails.targeting?.publisher_platforms || ['facebook', 'instagram'],
        placements: adsetDetails.targeting?.publisher_platforms || [],
      },
      budget: 0,
      status: 'PAUSED',
      optimizationGoal: adsetDetails.optimization_goal,
      billingEvent: adsetDetails.billing_event,
      bidStrategy: adsetDetails.bid_strategy,
      bidAmount: adsetDetails.bid_amount,
      promotedObject: adsetDetails.promoted_object,
      contentData: {
        landingPageUrl: linkData.link || '',
      },
    });
    await newAdset.save();

    const newAdsetId = newAdset._id.toString();

    // Download image if we have an image hash
    let importedAssetId: string | null = null;
    if (linkData.image_hash) {
      try {
        const accountIdWithPrefix = facebookAccount.accountId.startsWith('act_')
          ? facebookAccount.accountId
          : `act_${facebookAccount.accountId}`;
        
        const adimagesResponse = await axios.get(
          `https://graph.facebook.com/v24.0/${accountIdWithPrefix}/adimages`,
          {
            params: {
              hashes: `['${linkData.image_hash}']`,
              access_token: facebookAccount.accessToken,
            },
          }
        );
        
        const imageData = adimagesResponse.data?.images?.[linkData.image_hash];
        if (imageData?.url) {
          const imageResponse = await axios.get(imageData.url, {
            responseType: 'arraybuffer',
          });
          const imageBuffer = Buffer.from(imageResponse.data);

          const filename = `imported-${facebookAdId}-${Date.now()}.jpg`;
          const uploadsDir = path.join(process.cwd(), 'uploads', newAdsetId);
          await fs.mkdir(uploadsDir, { recursive: true });
          const filepath = path.join(uploadsDir, filename);
          await fs.writeFile(filepath, imageBuffer);

          const asset = new Asset({
            adsetId: newAdsetId,
            type: 'image',
            filename,
            filepath,
            url: `/uploads/${newAdsetId}/${filename}`,
            metadata: {
              facebookImageHash: linkData.image_hash,
            },
          });
          await asset.save();
          importedAssetId = asset._id.toString();
        }
      } catch (error: any) {
        console.error('Failed to download and save image:', error);
      }
    }

    // Create AdCopy entries
    const copyEntries: any[] = [];
    
    if (linkData.name) {
      const headline = new AdCopy({
        adsetId: newAdsetId,
        type: 'headline',
        content: linkData.name,
        variantIndex: 0,
        generatedByAI: false,
      });
      await headline.save();
      copyEntries.push({ type: 'headline', id: headline._id });
    }

    if (linkData.message) {
      const body = new AdCopy({
        adsetId: newAdsetId,
        type: 'body',
        content: linkData.message,
        variantIndex: 0,
        generatedByAI: false,
      });
      await body.save();
      copyEntries.push({ type: 'body', id: body._id });
    }

    if (linkData.description) {
      const description = new AdCopy({
        adsetId: newAdsetId,
        type: 'description',
        content: linkData.description,
        variantIndex: 0,
        generatedByAI: false,
      });
      await description.save();
      copyEntries.push({ type: 'description', id: description._id });
    }

    const ctaType = linkData.call_to_action?.type || 'LEARN_MORE';
    const ctaContent = linkData.call_to_action?.value?.link_caption || ctaType.replace(/_/g, ' ');
    const cta = new AdCopy({
      adsetId: newAdsetId,
      type: 'cta',
      content: ctaContent,
      variantIndex: 0,
      generatedByAI: false,
    });
    await cta.save();
    copyEntries.push({ type: 'cta', id: cta._id });

    res.json({
      success: true,
      adset: newAdset,
      imported: {
        assetId: importedAssetId,
        copyEntries,
        landingPageUrl: linkData.link,
        ctaType,
      },
      message: 'Adset created successfully with imported ad assets.',
    });
  } catch (error: any) {
    console.error('createAdsetFromWinningAd error:', error);
    res.status(500).json({ error: error.message || 'Failed to create adset from winning ad' });
  }
};

export const importWinningAd = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { facebookAdId, targetAdsetId } = req.body;

    if (!facebookAdId || !targetAdsetId) {
      res.status(400).json({ error: 'facebookAdId and targetAdsetId are required' });
      return;
    }

    // Verify target adset belongs to user
    const targetAdset = await Adset.findById(targetAdsetId);
    if (!targetAdset || (targetAdset.userId as any).toString() !== req.userId) {
      res.status(404).json({ error: 'Target adset not found or access denied' });
      return;
    }

    // Find the source combination
    const sourceCombination = await AdCombination.findOne({ facebookAdId }).populate('adsetId');
    if (!sourceCombination) {
      res.status(404).json({ error: 'Source ad not found' });
      return;
    }

    const sourceAdset = await Adset.findById((sourceCombination.adsetId as any)._id).populate('campaignId');
    if (!sourceAdset || (sourceAdset.userId as any).toString() !== req.userId) {
      res.status(404).json({ error: 'Source adset not found or access denied' });
      return;
    }

    const campaign: any = sourceAdset.campaignId;
    const facebookAccount = await FacebookAccount.findById(campaign.facebookAccountId);
    if (!facebookAccount) {
      res.status(404).json({ error: 'Facebook account not found' });
      return;
    }

    const apiService = new FacebookApiService(facebookAccount.accessToken);

    // Get ad details and creative
    const adDetails = await apiService.getAdDetails(facebookAdId);
    const creativeId = adDetails.creative?.id;
    if (!creativeId) {
      res.status(400).json({ error: 'Creative ID not found' });
      return;
    }

    const creativeDetails = await apiService.getAdCreativeDetails(creativeId);
    const linkData = creativeDetails.object_story_spec?.link_data || {};
    const adsetDetails = await apiService.getAdsetDetails(adDetails.adset_id);

    // Download image if we have an image hash
    let importedAssetId: string | null = null;
    if (linkData.image_hash) {
      try {
        // Get image URL from Facebook adimages endpoint
        const accountIdWithPrefix = facebookAccount.accountId.startsWith('act_')
          ? facebookAccount.accountId
          : `act_${facebookAccount.accountId}`;
        
        // Use axios directly to call Facebook API
        const adimagesResponse = await axios.get(
          `https://graph.facebook.com/v24.0/${accountIdWithPrefix}/adimages`,
          {
            params: {
              hashes: `['${linkData.image_hash}']`,
              access_token: facebookAccount.accessToken,
            },
          }
        );
        
        // Extract image URL from response
        const imageData = adimagesResponse.data?.images?.[linkData.image_hash];
        if (!imageData?.url) {
          throw new Error('Could not retrieve image URL from Facebook');
        }
        
        // Download the image
        const imageResponse = await axios.get(imageData.url, {
          responseType: 'arraybuffer',
        });
        const imageBuffer = Buffer.from(imageResponse.data);

        const filename = `imported-${facebookAdId}-${Date.now()}.jpg`;
        const uploadsDir = path.join(process.cwd(), 'uploads', targetAdsetId.toString());
        await fs.mkdir(uploadsDir, { recursive: true });
        const filepath = path.join(uploadsDir, filename);
        await fs.writeFile(filepath, imageBuffer);

        const asset = new Asset({
          adsetId: targetAdsetId,
          type: 'image',
          filename,
          filepath,
          url: `/uploads/${targetAdsetId}/${filename}`,
          metadata: {
            facebookImageHash: linkData.image_hash,
          },
        });
        await asset.save();
        importedAssetId = asset._id.toString();
      } catch (error: any) {
        console.error('Failed to download and save image:', error);
        // Continue without image - user can upload manually
      }
    }

    // Create AdCopy entries
    const copyEntries: any[] = [];
    
    if (linkData.name) {
      const headline = new AdCopy({
        adsetId: targetAdsetId,
        type: 'headline',
        content: linkData.name,
        variantIndex: 0,
        generatedByAI: false,
      });
      await headline.save();
      copyEntries.push({ type: 'headline', id: headline._id });
    }

    if (linkData.message) {
      const body = new AdCopy({
        adsetId: targetAdsetId,
        type: 'body',
        content: linkData.message,
        variantIndex: 0,
        generatedByAI: false,
      });
      await body.save();
      copyEntries.push({ type: 'body', id: body._id });
    }

    if (linkData.description) {
      const description = new AdCopy({
        adsetId: targetAdsetId,
        type: 'description',
        content: linkData.description,
        variantIndex: 0,
        generatedByAI: false,
      });
      await description.save();
      copyEntries.push({ type: 'description', id: description._id });
    }

    const ctaType = linkData.call_to_action?.type || 'LEARN_MORE';
    const ctaContent = linkData.call_to_action?.value?.link_caption || ctaType.replace(/_/g, ' ');
    const cta = new AdCopy({
      adsetId: targetAdsetId,
      type: 'cta',
      content: ctaContent,
      variantIndex: 0,
      generatedByAI: false,
    });
    await cta.save();
    copyEntries.push({ type: 'cta', id: cta._id });

    // Update target adset's contentData with landing page URL
    if (linkData.link) {
      targetAdset.contentData = targetAdset.contentData || {};
      targetAdset.contentData.landingPageUrl = linkData.link;
      await targetAdset.save();
    }

    // Optionally copy targeting if user wants (we'll just return it for now)
    const targeting = {
      ageMin: adsetDetails.targeting?.age_min,
      ageMax: adsetDetails.targeting?.age_max,
      genders: adsetDetails.targeting?.genders,
      locations: adsetDetails.targeting?.geo_locations?.countries || [],
      interests: adsetDetails.targeting?.interests?.map((i: any) => i.name || i) || [],
      behaviors: adsetDetails.targeting?.behaviors?.map((b: any) => b.name || b) || [],
      placements: adsetDetails.targeting?.publisher_platforms || [],
    };

    res.json({
      success: true,
      imported: {
        assetId: importedAssetId,
        copyEntries,
        landingPageUrl: linkData.link,
        ctaType,
        targeting,
      },
      message: 'Ad imported successfully. You can now create variants in the Adset Editor.',
    });
  } catch (error: any) {
    console.error('importWinningAd error:', error);
    res.status(500).json({ error: error.message || 'Failed to import ad' });
  }
};


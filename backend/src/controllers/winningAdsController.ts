import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Adset } from '../models/Adset';
import { AdCombination } from '../models/AdCombination';
import { FacebookAccount } from '../models/FacebookAccount';
import { FacebookApiService } from '../services/facebook/FacebookApiService';

// Helper to extract "Schedule" conversions from Facebook insights actions array
function extractScheduleConversions(actions: any[] | undefined): number {
  if (!actions || !Array.isArray(actions)) return 0;

  let total = 0;
  for (const action of actions) {
    const type = (action.action_type || '').toString().toLowerCase();
    if (type.includes('schedule')) {
      const value = Number(action.value || 0);
      if (!Number.isNaN(value)) {
        total += value;
      }
    }
  }
  return total;
}

export const getWinningAds = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { since, until } = req.query as { since?: string; until?: string };

    const endDate = until ? new Date(until) : new Date();
    const startDate = since ? new Date(since) : new Date(endDate);
    if (!since) {
      // default to last 30 days
      startDate.setDate(endDate.getDate() - 30);
    }

    const dateRange = {
      since: startDate.toISOString().split('T')[0],
      until: endDate.toISOString().split('T')[0],
    };

    // Get all adsets for this user
    const adsets = await Adset.find({ userId: req.userId }).populate('campaignId');
    const adsetIds = adsets.map((a) => a._id);

    if (adsetIds.length === 0) {
      res.json({ ads: [] });
      return;
    }

    // Map adsetId -> adset & campaign info for quick lookup
    const adsetMap = new Map<string, any>();
    for (const adset of adsets) {
      adsetMap.set(adset._id.toString(), adset);
    }

    // Get all deployed combinations that have a Facebook ad ID
    const combinations = await AdCombination.find({
      adsetId: { $in: adsetIds },
      deployedToFacebook: true,
      facebookAdId: { $exists: true, $ne: null },
    });

    if (combinations.length === 0) {
      res.json({ ads: [] });
      return;
    }

    // Assume all adsets for this user belong to the same Facebook account (first one)
    // We just need a token; account-specific info comes from each combination's campaign/adset
    const firstAdset: any = adsets[0];
    const campaign: any = firstAdset.campaignId;
    const facebookAccount = await FacebookAccount.findById(campaign.facebookAccountId);
    if (!facebookAccount) {
      res.status(400).json({ error: 'Facebook account not found for user campaigns' });
      return;
    }

    const apiService = new FacebookApiService(facebookAccount.accessToken);

    const results: any[] = [];

    for (const combo of combinations) {
      if (!combo.facebookAdId) continue;

      try {
        const insights = await apiService.getAdInsights(combo.facebookAdId, dateRange);

        const impressions = Number(insights.impressions || 0);
        const clicks = Number(insights.clicks || 0);
        const spend = Number(insights.spend || 0);
        const schedules = extractScheduleConversions(insights.actions);

        if (schedules <= 0) {
          // Skip ads without any "Schedule" conversions
          continue;
        }

        const costPerSchedule = schedules > 0 ? spend / schedules : 0;

        const adset = adsetMap.get(combo.adsetId.toString());
        const campaignForAdset = adset?.campaignId;

        // Build a link to the ad in Facebook Ads Manager for preview
        const accountId = facebookAccount.accountId.startsWith('act_')
          ? facebookAccount.accountId.replace('act_', '')
          : facebookAccount.accountId;
        const facebookAdLink = `https://www.facebook.com/adsmanager/manage/ads?act=${accountId}&selected_ad_ids[0]=${combo.facebookAdId}`;

        results.push({
          combinationId: combo._id,
          facebookAdId: combo.facebookAdId,
          adsetId: combo.adsetId,
          campaignName: campaignForAdset?.name || '',
          adsetName: adset?.name || '',
          impressions,
          clicks,
          spend,
          schedules,
          costPerSchedule,
          url: combo.url || adset?.contentData?.landingPageUrl || '',
          facebookAdLink,
          dateRange,
        });
      } catch (error: any) {
        console.error(`Failed to fetch insights for ad ${combo.facebookAdId}:`, error);
      }
    }

    // Sort by cost per schedule ascending (best first)
    results.sort((a, b) => a.costPerSchedule - b.costPerSchedule);

    res.json({ ads: results });
  } catch (error: any) {
    console.error('getWinningAds error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch winning ads' });
  }
};



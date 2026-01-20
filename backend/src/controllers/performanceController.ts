import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Adset } from '../models/Adset';
import { AdCombination } from '../models/AdCombination';
import { PerformanceData } from '../models/PerformanceData';
import { FacebookAccount } from '../models/FacebookAccount';
import { FacebookApiService } from '../services/facebook/FacebookApiService';

export const syncPerformanceData = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { adsetId } = req.params;

    const adset = await Adset.findById(adsetId).populate('campaignId');
    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    const campaign = adset.campaignId as any;
    const facebookAccount = await FacebookAccount.findById(campaign.facebookAccountId);
    if (!facebookAccount) {
      res.status(404).json({ error: 'Facebook account not found' });
      return;
    }

    const apiService = new FacebookApiService(facebookAccount.accessToken);

    // Get all deployed combinations
    const combinations = await AdCombination.find({
      adsetId,
      deployedToFacebook: true,
    });

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dateRange = {
      since: yesterday.toISOString().split('T')[0],
      until: today.toISOString().split('T')[0],
    };

    const syncedData = [];

    for (const combination of combinations) {
      if (!combination.facebookAdId) continue;

      try {
        const insights = await apiService.getAdInsights(combination.facebookAdId, dateRange);

        const performanceData = new PerformanceData({
          adCombinationId: combination._id,
          date: yesterday,
          impressions: insights.impressions || 0,
          clicks: insights.clicks || 0,
          ctr: insights.ctr || 0,
          spend: insights.spend || 0,
          frequency: insights.frequency || 0,
        });

        await performanceData.save();
        syncedData.push(performanceData);
      } catch (error: any) {
        console.error(`Failed to sync data for ad ${combination.facebookAdId}:`, error);
      }
    }

    res.json({
      success: true,
      synced: syncedData.length,
      data: syncedData,
    });
  } catch (error: any) {
    console.error('Sync performance data error:', error);
    res.status(500).json({ error: error.message || 'Failed to sync performance data' });
  }
};

export const getPerformanceData = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { adsetId } = req.params;

    const adset = await Adset.findOne({
      _id: adsetId,
      userId: req.userId,
    });

    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    const combinations = await AdCombination.find({ adsetId });
    const combinationIds = combinations.map((c) => c._id);

    const performanceData = await PerformanceData.find({
      adCombinationId: { $in: combinationIds },
    })
      .populate('adCombinationId')
      .sort({ date: -1 });

    res.json(performanceData);
  } catch (error: any) {
    console.error('Get performance data error:', error);
    res.status(500).json({ error: 'Failed to fetch performance data' });
  }
};


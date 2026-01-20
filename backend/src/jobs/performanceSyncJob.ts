import * as cron from 'node-cron';
import { Adset } from '../models/Adset';
import { AdCombination } from '../models/AdCombination';
import { PerformanceData } from '../models/PerformanceData';
import { FacebookAccount } from '../models/FacebookAccount';
import { FacebookApiService } from '../services/facebook/FacebookApiService';

export const startPerformanceSyncJob = () => {
  // Run daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('Starting daily performance data sync...');

    try {
      // Get all active adsets
      const adsets = await Adset.find({ status: 'ACTIVE' });

      for (const adset of adsets) {
        try {
          const campaign = await adset.populate('campaignId');
          const facebookAccount = await FacebookAccount.findById(
            (campaign.campaignId as any).facebookAccountId
          );

          if (!facebookAccount) continue;

          const apiService = new FacebookApiService(facebookAccount.accessToken);
          const combinations = await AdCombination.find({
            adsetId: adset._id,
            deployedToFacebook: true,
          });

          const today = new Date();
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);

          const dateRange = {
            since: yesterday.toISOString().split('T')[0],
            until: today.toISOString().split('T')[0],
          };

          for (const combination of combinations) {
            if (!combination.facebookAdId) continue;

            try {
              // Check if data already exists for this date
              const existing = await PerformanceData.findOne({
                adCombinationId: combination._id,
                date: yesterday,
              });

              if (existing) continue;

              const insights = await apiService.getAdInsights(
                combination.facebookAdId,
                dateRange
              );

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
            } catch (error: any) {
              console.error(
                `Failed to sync performance for combination ${combination._id}:`,
                error
              );
            }
          }
        } catch (error: any) {
          console.error(`Failed to sync adset ${adset._id}:`, error);
        }
      }

      console.log('Daily performance sync completed');
    } catch (error) {
      console.error('Performance sync job error:', error);
    }
  });

  console.log('Performance sync job scheduled (daily at 2 AM)');
};


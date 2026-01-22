import * as cron from 'node-cron';
import { FacebookAccount } from '../models/FacebookAccount';
import { FacebookApiService } from '../services/facebook/FacebookApiService';
import { TokenRefreshService } from '../services/facebook/TokenRefreshService';
import { DashboardCache } from '../models/DashboardCache';

// Helper to extract schedules from insights
function extractSchedules(insights: any): { count: number; costPerResult: number; conversionRate: number } {
  let total = 0;
  let costPerResult = 0;
  let conversionRate = 0;
  
  const results = insights?.results;
  if (Array.isArray(results)) {
    for (const result of results) {
      const indicator = (result.indicator || '').toString();
      const values = result.values || [];
      
      if (indicator === 'conversions:schedule_website' || indicator.includes('conversions:schedule_website')) {
        for (const val of values) {
          const value = Number(val.value || 0);
          if (!Number.isNaN(value) && value > 0) {
            total += value;
          }
        }
      }
    }
  }
  
  const costPerResultArray = insights?.cost_per_result;
  if (Array.isArray(costPerResultArray)) {
    for (const costResult of costPerResultArray) {
      const indicator = (costResult.indicator || '').toString();
      const values = costResult.values || [];
      
      if (indicator === 'conversions:schedule_website' || indicator.includes('conversions:schedule_website')) {
        if (values.length > 0) {
          const costValue = Number(values[0].value || 0);
          if (!Number.isNaN(costValue) && costValue > 0) {
            costPerResult = costValue;
          }
        }
      }
    }
  }
  
  const resultRateArray = insights?.result_rate;
  if (Array.isArray(resultRateArray)) {
    for (const rateResult of resultRateArray) {
      const indicator = (rateResult.indicator || '').toString();
      const values = rateResult.values || [];
      
      if (indicator === 'conversions:schedule_website' || indicator.includes('conversions:schedule_website')) {
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

// Function to fetch and cache dashboard stats for a user's Facebook account
async function fetchAndCacheDashboardStats(facebookAccount: any) {
  try {
    // Calculate date range (last 30 days)
    const until = new Date();
    const since = new Date();
    since.setDate(since.getDate() - 30);
    
    const sinceStr = since.toISOString().split('T')[0];
    const untilStr = until.toISOString().split('T')[0];
    const dateRange = { since: sinceStr, until: untilStr };

    // Check and refresh token
    await TokenRefreshService.checkAndRefreshToken(facebookAccount);
    
    const apiService = new FacebookApiService(facebookAccount.accessToken);
    const accountIdWithPrefix = facebookAccount.accountId.startsWith('act_')
      ? facebookAccount.accountId
      : `act_${facebookAccount.accountId}`;

    // Get all campaigns and filter to OUTCOME_LEADS only
    const campaigns = await apiService.getCampaigns(accountIdWithPrefix);
    const leadCampaigns = campaigns.filter(
      (c) => typeof c.objective === 'string' && c.objective.toUpperCase() === 'OUTCOME_LEADS'
    );


    // Aggregate stats
    let totalLeads = 0;
    let totalSpend = 0;
    const dailyStatsMap: Record<string, { leads: number; spend: number }> = {};
    const adConversionRates: Record<string, number> = {};

    // Initialize daily stats map
    for (let i = 0; i < 30; i++) {
      const date = new Date(since);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      dailyStatsMap[dateStr] = { leads: 0, spend: 0 };
    }

    // For each lead campaign, get insights at ad level with daily breakdown
    // Only process campaigns that had activity in the past 30 days
    for (const campaign of leadCampaigns) {
      try {
        const rows = await apiService.getCampaignAdInsights(campaign.id, dateRange, '1');

        // Skip campaigns with no activity in the date range
        if (rows.length === 0) {
          continue;
        }

        // Check if campaign has any spend or activity in the date range
        const hasActivity = rows.some((row: any) => {
          const spend = Number(row.spend || 0);
          const impressions = Number(row.impressions || 0);
          return spend > 0 || impressions > 0;
        });

        if (!hasActivity) {
          continue;
        }

        for (const row of rows) {
          const schedulesData = extractSchedules(row);
          const schedules = schedulesData.count;
          const spend = Number(row.spend || 0);
          const conversionRate = schedulesData.conversionRate;
          const adId = row.ad_id;

          totalLeads += schedules;
          totalSpend += spend;

          if (conversionRate > 0) {
            if (!adConversionRates[adId] || conversionRate > adConversionRates[adId]) {
              adConversionRates[adId] = conversionRate;
            }
          }

          const dateStr = row.date_start || row.date;
          if (dateStr && dailyStatsMap[dateStr]) {
            dailyStatsMap[dateStr].leads += schedules;
            dailyStatsMap[dateStr].spend += spend;
          }
        }
      } catch (error: any) {
        console.error(
          `[dashboardCacheJob] Failed to fetch insights for campaign ${campaign.id}:`,
          error.message
        );
      }
    }

    // Calculate averages
    const averageCostPerLead = totalLeads > 0 ? totalSpend / totalLeads : 0;
    const uniqueAdsWithConversion = Object.values(adConversionRates).filter((rate) => rate > 0);
    const averageConversionRate = uniqueAdsWithConversion.length > 0
      ? (uniqueAdsWithConversion.reduce((sum, rate) => sum + rate, 0) / uniqueAdsWithConversion.length) * 100
      : 0;

    // Convert daily stats map to array
    const dailyStats = Object.keys(dailyStatsMap)
      .sort()
      .map((date) => ({
        date,
        leads: Math.round(dailyStatsMap[date].leads),
        spend: Math.round(dailyStatsMap[date].spend * 100) / 100,
      }));

    // Upsert cache
    await DashboardCache.findOneAndUpdate(
      {
        userId: facebookAccount.userId,
        facebookAccountId: facebookAccount._id,
        since: sinceStr,
        until: untilStr,
      },
      {
        $set: {
          totalLeads: Math.round(totalLeads),
          totalSpend: Math.round(totalSpend * 100) / 100,
          averageCostPerLead: Math.round(averageCostPerLead * 100) / 100,
          averageConversionRate: Math.round(averageConversionRate * 100) / 100,
          dailyStats,
        },
      },
      { upsert: true, new: true }
    );

  } catch (error: any) {
    console.error(
      `[dashboardCacheJob] Failed to cache dashboard stats for account ${facebookAccount.accountId}:`,
      error.message
    );
  }
}

export const startDashboardCacheJob = () => {
  // Run every hour at minute 0 (e.g., 1:00, 2:00, 3:00, etc.)
  cron.schedule('0 * * * *', async () => {
    try {
      // Get all active Facebook accounts
      const facebookAccounts = await FacebookAccount.find({ isActive: true });

      // Cache stats for each account
      for (const account of facebookAccounts) {
        await fetchAndCacheDashboardStats(account);
      }
    } catch (error: any) {
      console.error('[dashboardCacheJob] Dashboard cache job error:', error.message);
    }
  });
};


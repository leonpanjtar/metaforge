import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { FacebookAccount } from '../models/FacebookAccount';
import { FacebookApiService } from '../services/facebook/FacebookApiService';
import { TokenRefreshService } from '../services/facebook/TokenRefreshService';
import { DashboardCache } from '../models/DashboardCache';
import { getAccountFilter } from '../utils/accountFilter';
import { UserAccount } from '../models/UserAccount';

// Helper to extract schedules from insights (same as winningAdsController)
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
  
  // Parse cost_per_result array
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
  
  // Parse result_rate array
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

// Get dashboard performance stats from cache or live Facebook API data
export const getDashboardStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Calculate date range (last 30 days)
    const until = new Date();
    const since = new Date();
    since.setDate(since.getDate() - 30);
    
    const sinceStr = since.toISOString().split('T')[0]; // YYYY-MM-DD
    const untilStr = until.toISOString().split('T')[0]; // YYYY-MM-DD

    // Get all active Facebook accounts for the user
    const facebookAccounts = await FacebookAccount.find({
      userId: req.userId,
      isActive: true,
    });

    if (facebookAccounts.length === 0) {
      res.json({
        totalLeads: 0,
        totalSpend: 0,
        averageCostPerLead: 0,
        averageConversionRate: 0,
        dailyStats: [],
        hasData: false,
      });
      return;
    }

    // Try to get cached data first (valid for 1 hour)
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const now = Date.now();
    
    const cachePromises = facebookAccounts.map((account) =>
      DashboardCache.findOne({
        userId: req.userId,
        facebookAccountId: account._id,
        since: sinceStr,
        until: untilStr,
      })
    );

    const caches = await Promise.all(cachePromises);
    const validCaches = caches.filter((cache) => {
      if (!cache) return false;
      // Check if cache is less than 1 hour old
      const cacheAge = now - cache.updatedAt.getTime();
      return cacheAge < ONE_HOUR_MS;
    });

    // If we have valid cache for all accounts, return cached data
    if (validCaches.length === facebookAccounts.length && validCaches.length > 0) {
      // Aggregate cached data
      let totalLeads = 0;
      let totalSpend = 0;
      let totalCostPerLead = 0;
      let totalConversionRate = 0;
      let accountsWithData = 0;
      const dailyStatsMap: Record<string, { leads: number; spend: number }> = {};

      // Initialize daily stats map
      for (let i = 0; i < 30; i++) {
        const date = new Date(since);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        dailyStatsMap[dateStr] = { leads: 0, spend: 0 };
      }

      validCaches.forEach((cache) => {
        if (cache && (cache.totalLeads > 0 || cache.totalSpend > 0)) {
          totalLeads += cache.totalLeads;
          totalSpend += cache.totalSpend;
          totalCostPerLead += cache.averageCostPerLead;
          totalConversionRate += cache.averageConversionRate;
          accountsWithData++;

          // Aggregate daily stats
          cache.dailyStats.forEach((day) => {
            if (dailyStatsMap[day.date]) {
              dailyStatsMap[day.date].leads += day.leads;
              dailyStatsMap[day.date].spend += day.spend;
            }
          });
        }
      });

      const averageCostPerLead = accountsWithData > 0 ? totalCostPerLead / accountsWithData : 0;
      const averageConversionRate = accountsWithData > 0 ? totalConversionRate / accountsWithData : 0;

      const dailyStats = Object.keys(dailyStatsMap)
        .sort()
        .map((date) => ({
          date,
          leads: Math.round(dailyStatsMap[date].leads),
          spend: Math.round(dailyStatsMap[date].spend * 100) / 100,
        }));

      res.json({
        totalLeads: Math.round(totalLeads),
        totalSpend: Math.round(totalSpend * 100) / 100,
        averageCostPerLead: Math.round(averageCostPerLead * 100) / 100,
        averageConversionRate: Math.round(averageConversionRate * 100) / 100,
        dailyStats,
        hasData: totalLeads > 0 || totalSpend > 0,
        fromCache: true,
      });
      return;
    }

    // Cache is stale or missing, fetch live data and cache it
    const dateRange = { since: sinceStr, until: untilStr };

    // Aggregate stats from all accounts
    let totalLeads = 0;
    let totalSpend = 0;
    const dailyStatsMap: Record<string, { leads: number; spend: number }> = {};
    const adConversionRates: Record<string, number> = {};
    const accountStats: Array<{
      accountId: string;
      leads: number;
      spend: number;
      costPerLead: number;
      conversionRate: number;
      dailyStats: Array<{ date: string; leads: number; spend: number }>;
    }> = [];

    // Initialize daily stats map
    for (let i = 0; i < 30; i++) {
      const date = new Date(since);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      dailyStatsMap[dateStr] = { leads: 0, spend: 0 };
    }

    // Fetch live data from Facebook for each account
    for (const facebookAccount of facebookAccounts) {
      try {
        // Check and refresh token
        await TokenRefreshService.checkAndRefreshToken(facebookAccount);
        
        const apiService = new FacebookApiService(facebookAccount.accessToken);
        const accountIdWithPrefix = facebookAccount.accountId.startsWith('act_')
          ? facebookAccount.accountId
          : `act_${facebookAccount.accountId}`;

        // Get all campaigns and filter to OUTCOME_LEADS
        const campaigns = await apiService.getCampaigns(accountIdWithPrefix);
        const leadCampaigns = campaigns.filter(
          (c) => typeof c.objective === 'string' && c.objective.toUpperCase() === 'OUTCOME_LEADS'
        );

        // Per-account stats
        let accountLeads = 0;
        let accountSpend = 0;
        const accountDailyStatsMap: Record<string, { leads: number; spend: number }> = {};
        const accountAdConversionRates: Record<string, number> = {};

        // Initialize account daily stats map
        for (let i = 0; i < 30; i++) {
          const date = new Date(since);
          date.setDate(date.getDate() + i);
          const dateStr = date.toISOString().split('T')[0];
          accountDailyStatsMap[dateStr] = { leads: 0, spend: 0 };
        }

        // For each lead campaign, get insights at ad level with daily breakdown
        for (const campaign of leadCampaigns) {
          try {
            const rows = await apiService.getCampaignAdInsights(campaign.id, dateRange, 'day');

            for (const row of rows) {
              const schedulesData = extractSchedules(row);
              const schedules = schedulesData.count;
              const spend = Number(row.spend || 0);
              const conversionRate = schedulesData.conversionRate;
              const adId = row.ad_id;

              accountLeads += schedules;
              accountSpend += spend;

              // Store conversion rate per ad
              if (conversionRate > 0) {
                if (!accountAdConversionRates[adId] || conversionRate > accountAdConversionRates[adId]) {
                  accountAdConversionRates[adId] = conversionRate;
                }
              }

              // Aggregate daily stats
              const dateStr = row.date_start || row.date;
              if (dateStr && accountDailyStatsMap[dateStr]) {
                accountDailyStatsMap[dateStr].leads += schedules;
                accountDailyStatsMap[dateStr].spend += spend;
              }
            }
          } catch (error: any) {
            console.error(
              `[getDashboardStats] Failed to fetch insights for campaign ${campaign.id}:`,
              error.message
            );
          }
        }

        // Calculate account averages
        const accountAverageCostPerLead = accountLeads > 0 ? accountSpend / accountLeads : 0;
        const uniqueAdsWithConversion = Object.values(accountAdConversionRates).filter((rate) => rate > 0);
        const accountAverageConversionRate = uniqueAdsWithConversion.length > 0
          ? (uniqueAdsWithConversion.reduce((sum, rate) => sum + rate, 0) / uniqueAdsWithConversion.length) * 100
          : 0;

        const accountDailyStats = Object.keys(accountDailyStatsMap)
          .sort()
          .map((date) => ({
            date,
            leads: Math.round(accountDailyStatsMap[date].leads),
            spend: Math.round(accountDailyStatsMap[date].spend * 100) / 100,
          }));

        // Add to totals
        totalLeads += accountLeads;
        totalSpend += accountSpend;
        accountDailyStats.forEach((day) => {
          if (dailyStatsMap[day.date]) {
            dailyStatsMap[day.date].leads += day.leads;
            dailyStatsMap[day.date].spend += day.spend;
          }
        });

        // Store account stats for caching
        accountStats.push({
          accountId: facebookAccount._id.toString(),
          leads: accountLeads,
          spend: accountSpend,
          costPerLead: accountAverageCostPerLead,
          conversionRate: accountAverageConversionRate,
          dailyStats: accountDailyStats,
        });

        // Cache this account's data
        await DashboardCache.findOneAndUpdate(
          {
            userId: req.userId,
            facebookAccountId: facebookAccount._id,
            since: sinceStr,
            until: untilStr,
          },
          {
            $set: {
              totalLeads: Math.round(accountLeads),
              totalSpend: Math.round(accountSpend * 100) / 100,
              averageCostPerLead: Math.round(accountAverageCostPerLead * 100) / 100,
              averageConversionRate: Math.round(accountAverageConversionRate * 100) / 100,
              dailyStats: accountDailyStats,
            },
          },
          { upsert: true, new: true }
        );
      } catch (error: any) {
        console.error(
          `[getDashboardStats] Failed to fetch data for account ${facebookAccount.accountId}:`,
          error.message
        );
      }
    }

    // Calculate overall averages
    const averageCostPerLead = totalLeads > 0 ? totalSpend / totalLeads : 0;
    const averageConversionRate = accountStats.length > 0
      ? accountStats.reduce((sum, acc) => sum + acc.conversionRate, 0) / accountStats.length
      : 0;

    const dailyStats = Object.keys(dailyStatsMap)
      .sort()
      .map((date) => ({
        date,
        leads: Math.round(dailyStatsMap[date].leads),
        spend: Math.round(dailyStatsMap[date].spend * 100) / 100,
      }));

    res.json({
      totalLeads: Math.round(totalLeads),
      totalSpend: Math.round(totalSpend * 100) / 100,
      averageCostPerLead: Math.round(averageCostPerLead * 100) / 100,
      averageConversionRate: Math.round(averageConversionRate * 100) / 100,
      dailyStats,
      hasData: totalLeads > 0 || totalSpend > 0,
      fromCache: false,
    });
  } catch (error: any) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch dashboard stats' });
  }
};

// Get Facebook connection status for the account
export const getFacebookConnectionStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get account filter to check user's role
    const accountFilter = await getAccountFilter(req);

    // Get user's role in the account
    let canManageConnection = false;
    if (accountFilter.accountId) {
      const membership = await UserAccount.findOne({
        userId: req.userId,
        accountId: accountFilter.accountId,
      });
      canManageConnection = membership ? ['owner', 'admin'].includes(membership.role) : false;
    } else {
      // If no account context, user can manage their own connections
      canManageConnection = true;
    }

    // Get all Facebook accounts for the user
    const facebookAccounts = await FacebookAccount.find({
      userId: req.userId,
    });

    // Check if any account is active
    const activeAccounts = facebookAccounts.filter((account) => {
      if (!account.isActive) return false;
      if (account.tokenExpiry && account.tokenExpiry < new Date()) {
        return false;
      }
      return true;
    });

    const hasActiveConnection = activeAccounts.length > 0;
    const connectionStatus = hasActiveConnection ? 'active' : 'expired';

    res.json({
      hasConnection: facebookAccounts.length > 0,
      hasActiveConnection,
      connectionStatus,
      accountCount: facebookAccounts.length,
      activeAccountCount: activeAccounts.length,
      canManageConnection,
      accounts: facebookAccounts.map((acc) => ({
        _id: acc._id,
        accountName: acc.accountName,
        isActive: acc.isActive,
        tokenExpiry: acc.tokenExpiry,
        expiresAt: acc.tokenExpiry,
      })),
    });
  } catch (error: any) {
    console.error('Get Facebook connection status error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch connection status' });
  }
};


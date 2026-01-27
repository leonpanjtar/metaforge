import { FacebookApiService, FacebookCampaign, FacebookAdset } from './FacebookApiService';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// Shared cache across all instances (module-level)
const sharedCache: Map<string, CacheEntry<any>> = new Map();

/**
 * Caching service wrapper for FacebookApiService to reduce API rate limits
 * Uses in-memory caching with configurable TTLs for different data types
 * Cache is shared across all instances to maximize cache hits
 */
export class FacebookCacheService {
  private apiService: FacebookApiService;

  // Cache TTLs in milliseconds
  private readonly TTL = {
    CAMPAIGNS: 10 * 60 * 1000,      // 10 minutes
    ADSETS: 10 * 60 * 1000,          // 10 minutes
    PAGES: 60 * 60 * 1000,           // 60 minutes (pages change rarely)
    AD_ACCOUNTS: 30 * 60 * 1000,     // 30 minutes
    ADSET_DETAILS: 5 * 60 * 1000,    // 5 minutes
    AD_DETAILS: 5 * 60 * 1000,       // 5 minutes
    CREATIVE_DETAILS: 5 * 60 * 1000, // 5 minutes
    INSIGHTS: 2 * 60 * 1000,         // 2 minutes (performance data changes frequently)
  };

  constructor(accessToken: string) {
    this.apiService = new FacebookApiService(accessToken);
  }

  // Static cleanup method - only initialize once
  private static cleanupInitialized = false;
  static initializeCleanup() {
    if (!FacebookCacheService.cleanupInitialized) {
      // Clean up expired entries every 5 minutes
      setInterval(() => {
        const now = Date.now();
        const keysToDelete: string[] = [];
        for (const [key, entry] of sharedCache.entries()) {
          if (entry.expiresAt <= now) {
            keysToDelete.push(key);
          }
        }
        keysToDelete.forEach(key => sharedCache.delete(key));
      }, 5 * 60 * 1000);
      FacebookCacheService.cleanupInitialized = true;
    }
  }

  /**
   * Get cache key for a specific resource
   */
  private getCacheKey(type: string, ...params: any[]): string {
    return `${type}:${params.join(':')}`;
  }

  /**
   * Get cached data or fetch if expired/missing
   */
  private async getOrFetch<T>(
    cacheKey: string,
    ttl: number,
    fetchFn: () => Promise<T>
  ): Promise<T> {
    FacebookCacheService.initializeCleanup();
    const cached = sharedCache.get(cacheKey);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      return cached.data as T;
    }

    // Fetch fresh data
    const data = await fetchFn();
    sharedCache.set(cacheKey, {
      data,
      expiresAt: now + ttl,
    });

    return data;
  }

  /**
   * Invalidate cache entries matching a pattern
   */
  invalidate(pattern: string): void {
    const keysToDelete: string[] = [];
    for (const key of sharedCache.keys()) {
      if (key.startsWith(pattern)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => sharedCache.delete(key));
  }

  /**
   * Clear all cache entries
   */
  static clearAll(): void {
    sharedCache.clear();
  }

  // Wrapped API methods with caching

  async getAdAccounts(): Promise<any[]> {
    return this.getOrFetch(
      this.getCacheKey('adAccounts'),
      this.TTL.AD_ACCOUNTS,
      () => this.apiService.getAdAccounts()
    );
  }

  async getCampaigns(accountId: string): Promise<FacebookCampaign[]> {
    return this.getOrFetch(
      this.getCacheKey('campaigns', accountId),
      this.TTL.CAMPAIGNS,
      () => this.apiService.getCampaigns(accountId)
    );
  }

  async getAdsets(campaignId: string): Promise<FacebookAdset[]> {
    return this.getOrFetch(
      this.getCacheKey('adsets', campaignId),
      this.TTL.ADSETS,
      () => this.apiService.getAdsets(campaignId)
    );
  }

  async getPages(): Promise<Array<{ id: string; name: string }>> {
    return this.getOrFetch(
      this.getCacheKey('pages'),
      this.TTL.PAGES,
      () => this.apiService.getPages()
    );
  }

  async getAdsetDetails(adsetId: string): Promise<any> {
    return this.getOrFetch(
      this.getCacheKey('adsetDetails', adsetId),
      this.TTL.ADSET_DETAILS,
      () => this.apiService.getAdsetDetails(adsetId)
    );
  }

  async getAdDetails(adId: string): Promise<any> {
    return this.getOrFetch(
      this.getCacheKey('adDetails', adId),
      this.TTL.AD_DETAILS,
      () => this.apiService.getAdDetails(adId)
    );
  }

  async getAdCreativeDetails(creativeId: string): Promise<any> {
    return this.getOrFetch(
      this.getCacheKey('creativeDetails', creativeId),
      this.TTL.CREATIVE_DETAILS,
      () => this.apiService.getAdCreativeDetails(creativeId)
    );
  }

  async getCampaignAdInsights(
    campaignId: string,
    dateRange: { since: string; until: string },
    timeIncrement?: string
  ): Promise<any[]> {
    // Insights are more dynamic, shorter cache
    return this.getOrFetch(
      this.getCacheKey('campaignInsights', campaignId, dateRange.since, dateRange.until, timeIncrement || ''),
      this.TTL.INSIGHTS,
      () => this.apiService.getCampaignAdInsights(campaignId, dateRange, timeIncrement)
    );
  }

  async getAccountAdInsights(
    accountId: string,
    dateRange: { since: string; until: string },
    retries?: number
  ): Promise<any[]> {
    // Insights are more dynamic, shorter cache
    return this.getOrFetch(
      this.getCacheKey('accountInsights', accountId, dateRange.since, dateRange.until),
      this.TTL.INSIGHTS,
      () => this.apiService.getAccountAdInsights(accountId, dateRange, retries)
    );
  }

  async getAdInsights(
    adId: string,
    dateRange: { since: string; until: string }
  ): Promise<any> {
    return this.getOrFetch(
      this.getCacheKey('adInsights', adId, dateRange.since, dateRange.until),
      this.TTL.INSIGHTS,
      () => this.apiService.getAdInsights(adId, dateRange)
    );
  }

  // Methods that don't need caching (write operations)
  async createAdset(accountId: string, adsetData: any): Promise<string> {
    // Invalidate campaigns and adsets cache after creation
    this.invalidate('campaigns:');
    this.invalidate('adsets:');
    return this.apiService.createAdset(accountId, adsetData);
  }

  async uploadAdImage(accountId: string, imageUrl: string): Promise<string> {
    return this.apiService.uploadAdImage(accountId, imageUrl);
  }

  async uploadAdVideo(accountId: string, videoUrl: string): Promise<string> {
    return this.apiService.uploadAdVideo(accountId, videoUrl);
  }

  async createAdCreative(accountId: string, creativeData: any): Promise<string> {
    return this.apiService.createAdCreative(accountId, creativeData);
  }

  async createAdCreativeWithAI(
    accountId: string,
    creativeData: any
  ): Promise<string> {
    return this.apiService.createAdCreativeWithAI(accountId, creativeData);
  }

  async createAd(accountId: string, adData: any): Promise<string> {
    // Invalidate adsets cache after ad creation
    this.invalidate('adsets:');
    return this.apiService.createAd(accountId, adData);
  }

  async getLongLivedToken(shortLivedToken: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    return this.apiService.getLongLivedToken(shortLivedToken);
  }

  async getAdsPixelId(accountId: string): Promise<string | null> {
    return this.getOrFetch(
      this.getCacheKey('pixelId', accountId),
      this.TTL.AD_ACCOUNTS,
      () => this.apiService.getAdsPixelId(accountId)
    );
  }

  async getAdsPixelStats(
    pixelId: string,
    dateRange: { since: string; until: string }
  ): Promise<any> {
    return this.getOrFetch(
      this.getCacheKey('pixelStats', pixelId, dateRange.since, dateRange.until),
      this.TTL.INSIGHTS,
      () => this.apiService.getAdsPixelStats(pixelId, dateRange)
    );
  }

  async getAdsForAdset(adsetId: string): Promise<any[]> {
    return this.getOrFetch(
      this.getCacheKey('adsForAdset', adsetId),
      this.TTL.ADSETS,
      () => this.apiService.getAdsForAdset(adsetId)
    );
  }

  async getAITextVariations(creativeId: string): Promise<any> {
    return this.apiService.getAITextVariations(creativeId);
  }

  async previewAICreative(
    adId: string,
    adFormat: string,
    creativeFeature: 'image_uncrop' | 'image_background_gen'
  ): Promise<any> {
    return this.apiService.previewAICreative(adId, adFormat, creativeFeature);
  }

  async generateAIPreviews(
    accountId: string,
    creativeSpec: any,
    adFormat?: string
  ): Promise<any> {
    return this.apiService.generateAIPreviews(accountId, creativeSpec, adFormat);
  }
}

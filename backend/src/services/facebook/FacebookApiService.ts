import axios, { AxiosInstance } from 'axios';

export interface FacebookAdAccount {
  id: string;
  name: string;
  account_id: string;
}

export interface FacebookCampaign {
  id: string;
  name: string;
  objective: string;
  status: string;
}

export interface FacebookAdset {
  id: string;
  name: string;
  status: string;
}

export interface FacebookAd {
  id: string;
  name: string;
  status: string;
}

export class FacebookApiService {
  private api: AxiosInstance;
  private accessToken: string;
  private apiVersion = 'v24.0';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
    this.api = axios.create({
      baseURL: `https://graph.facebook.com/${this.apiVersion}`,
      params: {
        access_token: accessToken,
      },
    });
  }

  /**
   * Debug helper: log token scopes & permissions (dev only)
   */
  private async logTokenScopesIfDev() {
    if (process.env.NODE_ENV !== 'development') return;

    try {
      const appId = process.env.FACEBOOK_APP_ID;
      const appSecret = process.env.FACEBOOK_APP_SECRET;
      if (!appId || !appSecret) {
        console.warn(
          '[FacebookApiService.debugToken] FACEBOOK_APP_ID or FACEBOOK_APP_SECRET not set; cannot debug token scopes.'
        );
        return;
      }

      const debugResponse = await axios.get(
        `https://graph.facebook.com/${this.apiVersion}/debug_token`,
        {
          params: {
            input_token: this.accessToken,
            access_token: `${appId}|${appSecret}`,
          },
        }
      );

      // Token debug info available in data if needed
    } catch (err: any) {
      // Silently fail token debugging
    }
  }

  async getAdAccounts(): Promise<FacebookAdAccount[]> {
    try {
      const response = await this.api.get('/me/adaccounts', {
        params: {
          fields: 'id,name,account_id',
        },
      });
      return response.data.data || [];
    } catch (error: any) {
      throw new Error(
        `Failed to fetch ad accounts: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  async getCampaigns(accountId: string): Promise<FacebookCampaign[]> {
    try {
      const response = await this.api.get(`/${accountId}/campaigns`, {
        params: {
          fields: 'id,name,objective,status',
        },
      });
      return response.data.data || [];
    } catch (error: any) {
      throw new Error(
        `Failed to fetch campaigns: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  async getAdsets(campaignId: string): Promise<FacebookAdset[]> {
    try {
      const response = await this.api.get(`/${campaignId}/adsets`, {
        params: {
          fields: 'id,name,status',
        },
      });
      return response.data.data || [];
    } catch (error: any) {
      throw new Error(
        `Failed to fetch adsets: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  async getAdsForAdset(adsetId: string): Promise<FacebookAd[]> {
    try {
      const response = await this.api.get(`/${adsetId}/ads`, {
        params: {
          fields: 'id,name,status',
        },
      });
      return response.data.data || [];
    } catch (error: any) {
      throw new Error(
        `Failed to fetch ads for adset: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Get insights at AD level for all ads in a given campaign (used for Winning Ads view).
   */
  async getCampaignAdInsights(
    campaignId: string,
    dateRange: { since: string; until: string },
    timeIncrement?: string
  ): Promise<any[]> {
    try {
      const params: any = {
        level: 'ad',
        fields: [
          'ad_id',
          'ad_name',
          'adset_id',
          'adset_name',
          'campaign_name',
          'impressions',
          'clicks',
          'ctr',
          'spend',
          'actions',
          'results',
          'objective_results',
          'cost_per_result',
          'result_values_performance_indicator',
          'result_rate',
        ].join(','),
        time_range: JSON.stringify(dateRange),
      };

      // Facebook API accepts '1' for daily breakdown, or 'all_days' for aggregated
      if (timeIncrement === 'day') {
        params.time_increment = '1'; // Use '1' for daily breakdown
      } else if (timeIncrement) {
        params.time_increment = timeIncrement;
      }

      const response = await this.api.get(`/${campaignId}/insights`, { params });
      return response.data.data || [];
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      const message =
        fbError?.message || error.message || 'Failed to fetch campaign ad insights';
      // Surface clear info for rate-limit situations
      throw new Error(`Failed to fetch campaign ad insights: ${message}`);
    }
  }

  /**
   * Get account-level insights for all ads with schedule_website conversions.
   * Single API call for entire ad account to get ad-level data.
   * Handles pagination automatically.
   */
  async getAccountAdInsights(
    accountId: string,
    dateRange: { since: string; until: string }
  ): Promise<any[]> {
    try {
      const allResults: any[] = [];
      let nextUrl: string | null = null;
      let pageCount = 0;
      const maxPages = 100; // Safety limit

      do {
        let response;
        if (nextUrl) {
          // For pagination, use axios directly with the full URL
          // The next URL already contains the access token
          response = await axios.get(nextUrl);
        } else {
          // First page - construct URL manually to match the exact working query format
          // Note: accountId should already include 'act_' prefix
          const baseUrl = `https://graph.facebook.com/${this.apiVersion}/${accountId}/insights`;
          const params = new URLSearchParams({
            fields: 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,impressions,reach,spend,clicks,inline_link_clicks,actions,action_values,conversions,conversion_values,cost_per_action_type',
            'time_range[since]': dateRange.since,
            'time_range[until]': dateRange.until,
            action_breakdowns: 'action_type',
            action_type: 'schedule_website',
            level: 'ad',
            access_token: this.accessToken,
          });
          
          const url = `${baseUrl}?${params.toString()}`;
          response = await axios.get(url);
        }

        const data = response.data.data || [];
        allResults.push(...data);

        // Check for pagination
        const paging: any = response.data.paging;
        if (paging && paging.next) {
          nextUrl = paging.next;
          pageCount++;
        } else {
          nextUrl = null;
        }

        // Safety check to prevent infinite loops
        if (pageCount >= maxPages) {
          console.warn(`[getAccountAdInsights] Reached max pages limit (${maxPages}), stopping pagination`);
          break;
        }
      } while (nextUrl);

      return allResults;
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      const message =
        fbError?.message || error.message || 'Failed to fetch account ad insights';
      throw new Error(`Failed to fetch account ad insights: ${message}`);
    }
  }

  async getPages(): Promise<Array<{ id: string; name: string }>> {
    try {
      const response = await this.api.get('/me/accounts', {
        params: {
          fields: 'id,name',
        },
      });
      return response.data.data || [];
    } catch (error: any) {
      throw new Error(
        `Failed to fetch pages: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  async getAdsetDetails(adsetId: string): Promise<any> {
    try {
      const response = await this.api.get(`/${adsetId}`, {
        params: {
          fields: [
            'id',
            'name',
            'status',
            'daily_budget',
            'lifetime_budget',
            'budget_remaining',
            'targeting',
            'optimization_goal',
            'billing_event',
            'bid_strategy',
            'bid_amount',
            'promoted_object',
            'attribution_spec',
            'start_time',
            'end_time',
            'campaign_id',
          ].join(','),
        },
      });
      return response.data;
    } catch (error: any) {
      throw new Error(
        `Failed to fetch adset details: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  async createAdset(accountId: string, adsetData: any): Promise<string> {
    try {
      const response = await this.api.post(`/${accountId}/adsets`, adsetData);
      const adsetId = response.data.id;
      
      // Verify the adset was created successfully
      if (!adsetId) {
        throw new Error('Adset creation succeeded but no ID was returned');
      }
      
      return adsetId;
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      console.error('[FacebookApiService.createAdset] Error:', {
        message: fbError?.message || error.message,
        code: fbError?.code,
        type: fbError?.type,
        errorSubcode: fbError?.error_subcode,
        fullError: fbError,
        requestData: adsetData,
      });
      throw new Error(
        `Failed to create adset: ${fbError?.message || error.message}`
      );
    }
  }

  async uploadAdImage(accountId: string, imageUrl: string): Promise<string> {
    try {
      await this.logTokenScopesIfDev();
      
      // Fetch the image from the URL and convert to base64 (API v24.0 requires bytes parameter)
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 second timeout
      });
      
      const imageBuffer = Buffer.from(imageResponse.data);
      const base64Image = imageBuffer.toString('base64');
      
      // Upload using bytes parameter (API v24.0)
      const response = await this.api.post(`/${accountId}/adimages`, {
        bytes: base64Image,
      });
      
      // Response format: { images: { <hash>: { hash: "...", url: "...", ... } } }
      if (response.data.images) {
        const imageEntries = Object.values(response.data.images) as any[];
        if (imageEntries.length > 0 && imageEntries[0].hash) {
          return imageEntries[0].hash;
        }
      }
      
      throw new Error('No image hash returned from Facebook');
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      const errorCode = fbError?.code;
      const errorMessage = fbError?.message || error.message;
      console.error('[FacebookApiService.uploadAdImage] Error response', {
        code: errorCode,
        message: errorMessage,
        type: fbError?.type,
        errorSubcode: fbError?.error_subcode,
        raw: error.response?.data,
      });
      
      // Error code 3 usually means permission issue or invalid endpoint
      if (errorCode === 3) {
        throw new Error(
          `Failed to upload image: ${errorMessage}. This usually means:\n` +
          `1. Your Facebook app needs 'ads_management' permission\n` +
          `2. The ad account needs to be approved for advertising\n` +
          `3. The image URL must be publicly accessible\n` +
          `4. Try using a publicly accessible HTTPS URL instead of localhost`
        );
      }
      
      throw new Error(`Failed to upload image: ${errorMessage}`);
    }
  }

  async uploadAdVideo(accountId: string, videoUrl: string): Promise<string> {
    try {
      const response = await this.api.post(`/${accountId}/advideos`, {
        url: videoUrl,
      });
      return response.data.id;
    } catch (error: any) {
      throw new Error(
        `Failed to upload video: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  async createAdCreative(accountId: string, creativeData: any): Promise<string> {
    try {
      console.log('[FacebookApiService.createAdCreative] Request:', {
        accountId,
        creativeData: JSON.stringify(creativeData, null, 2),
      });
      const response = await this.api.post(`/${accountId}/adcreatives`, creativeData);
      const creativeId = response.data.id;
      if (!creativeId) {
        throw new Error('Ad creative creation succeeded but no ID was returned');
      }
      return creativeId;
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      console.error('[FacebookApiService.createAdCreative] Error:', {
        message: fbError?.message || error.message,
        code: fbError?.code,
        type: fbError?.type,
        errorSubcode: fbError?.error_subcode,
        fullError: fbError,
        requestData: creativeData,
      });
      throw new Error(
        `Failed to create ad creative: ${fbError?.message || error.message}`
      );
    }
  }

  async createAd(accountId: string, adData: any): Promise<string> {
    try {
      const response = await this.api.post(`/${accountId}/ads`, adData);
      return response.data.id;
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      console.error('[FacebookApiService.createAd] Error:', {
        accountId,
        message: fbError?.message || error.message,
        code: fbError?.code,
        type: fbError?.type,
        errorSubcode: fbError?.error_subcode,
        fullError: fbError,
        requestData: adData,
      });
      throw new Error(
        `Failed to create ad: ${fbError?.message || error.message}`
      );
    }
  }

  async getAdInsights(adId: string, dateRange: { since: string; until: string }): Promise<any> {
    try {
      const response = await this.api.get(`/${adId}/insights`, {
        params: {
          // We rely on:
          // - results / objective_results when objective = OUTCOME_LEADS
          // - actions (with action_type containing 'lead') as a fallback
          fields: 'impressions,clicks,ctr,spend,actions,results,objective_results',
          time_range: JSON.stringify(dateRange),
        },
      });
      return response.data.data[0] || {};
    } catch (error: any) {
      throw new Error(
        `Failed to fetch ad insights: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  async getAdDetails(adId: string): Promise<any> {
    try {
      const response = await this.api.get(`/${adId}`, {
        params: {
          fields: 'id,name,status,adset_id,creative{id,object_story_spec}',
        },
      });
      return response.data;
    } catch (error: any) {
      throw new Error(
        `Failed to fetch ad details: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  async getAdCreativeDetails(creativeId: string): Promise<any> {
    try {
      const response = await this.api.get(`/${creativeId}`, {
        params: {
          fields: 'id,name,object_story_spec',
        },
      });
      return response.data;
    } catch (error: any) {
      throw new Error(
        `Failed to fetch ad creative details: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Create an ad creative with Meta's Generative AI features enabled
   * Supports: Text Generation, Image Expansion, Background Generation
   * Reference: https://developers.facebook.com/docs/marketing-api/creative/generative-ai-features/
   */
  async createAdCreativeWithAI(
    accountId: string,
    creativeData: {
      name: string;
      objectStorySpec: any;
      pageId: string;
      aiFeatures?: {
        textGeneration?: boolean;
        imageExpansion?: boolean;
        backgroundGeneration?: boolean;
      };
      productSetId?: string;
    }
  ): Promise<string> {
    try {
      const creativeSpec: any = {
        name: creativeData.name,
        object_story_spec: creativeData.objectStorySpec,
      };

      // Add Meta Generative AI features
      if (creativeData.aiFeatures) {
        creativeSpec.degrees_of_freedom_spec = {
          creative_features_spec: {},
        };

        if (creativeData.aiFeatures.textGeneration) {
          creativeSpec.degrees_of_freedom_spec.creative_features_spec.text_generation = {
            enroll_status: 'OPT_IN',
          };
        }

        if (creativeData.aiFeatures.imageExpansion) {
          creativeSpec.degrees_of_freedom_spec.creative_features_spec.image_uncrop = {
            enroll_status: 'OPT_IN',
          };
        }

        if (creativeData.aiFeatures.backgroundGeneration) {
          creativeSpec.degrees_of_freedom_spec.creative_features_spec.image_background_gen = {
            enroll_status: 'OPT_IN',
          };
          if (creativeData.productSetId) {
            creativeSpec.product_set_id = creativeData.productSetId;
          }
        }
      }

      const response = await this.api.post(`/${accountId}/adcreatives`, creativeSpec);
      return response.data.id;
    } catch (error: any) {
      throw new Error(
        `Failed to create ad creative with AI: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Get AI-generated text variations from a creative
   * Returns the asset_feed_spec which contains generated text suggestions
   */
  async getAITextVariations(creativeId: string): Promise<any> {
    try {
      const response = await this.api.get(`/${creativeId}`, {
        params: {
          fields: 'asset_feed_spec',
        },
      });
      return response.data.asset_feed_spec;
    } catch (error: any) {
      throw new Error(
        `Failed to get AI text variations: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Preview ad creative with AI transformations
   * Supports previewing image expansion and background generation
   */
  async previewAICreative(
    adId: string,
    adFormat: string,
    creativeFeature: 'image_uncrop' | 'image_background_gen'
  ): Promise<any> {
    try {
      const response = await this.api.get(`/${adId}/previews`, {
        params: {
          ad_format: adFormat,
          creative_feature: creativeFeature,
        },
      });
      return response.data;
    } catch (error: any) {
      throw new Error(
        `Failed to preview AI creative: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Generate previews of AI variations without creating an ad
   * This allows users to see Meta AI variations before committing to ad creation
   * Reference: https://developers.facebook.com/docs/marketing-api/creative/generative-ai-features/
   */
  async generateAIPreviews(
    accountId: string,
    creativeSpec: {
      objectStorySpec: any;
      pageId: string;
      aiFeatures?: {
        textGeneration?: boolean;
        imageExpansion?: boolean;
        backgroundGeneration?: boolean;
      };
    },
    adFormat: string = 'MOBILE_FEED_STANDARD'
  ): Promise<any> {
    try {
      const previewData: any = {
        ad_format: adFormat,
        creative: {
          object_story_spec: creativeSpec.objectStorySpec,
        },
      };

      // Add AI features if specified
      if (creativeSpec.aiFeatures) {
        previewData.creative.degrees_of_freedom_spec = {
          creative_features_spec: {},
        };

        if (creativeSpec.aiFeatures.textGeneration) {
          previewData.creative.degrees_of_freedom_spec.creative_features_spec.text_generation = {
            enroll_status: 'OPT_IN',
          };
        }

        if (creativeSpec.aiFeatures.imageExpansion) {
          previewData.creative.degrees_of_freedom_spec.creative_features_spec.image_uncrop = {
            enroll_status: 'OPT_IN',
          };
          previewData.creative_feature = 'image_uncrop';
        }

        if (creativeSpec.aiFeatures.backgroundGeneration) {
          previewData.creative.degrees_of_freedom_spec.creative_features_spec.image_background_gen = {
            enroll_status: 'OPT_IN',
          };
          previewData.creative_feature = 'image_background_gen';
        }
      }

      const response = await this.api.get(`/${accountId}/generatepreviews`, {
        params: previewData,
      });
      return response.data;
    } catch (error: any) {
      throw new Error(
        `Failed to generate AI previews: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  async getLongLivedToken(shortLivedToken: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    try {
      const appId = process.env.FACEBOOK_APP_ID;
      const appSecret = process.env.FACEBOOK_APP_SECRET;
      const response = await axios.get(
        `https://graph.facebook.com/${this.apiVersion}/oauth/access_token`,
        {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: appId,
            client_secret: appSecret,
            fb_exchange_token: shortLivedToken,
          },
        }
      );
      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in || 5184000, // Default 60 days in seconds
      };
    } catch (error: any) {
      throw new Error(
        `Failed to exchange token: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Get Ads Pixel ID for an ad account
   */
  async getAdsPixelId(accountId: string): Promise<string | null> {
    try {
      const response = await this.api.get(`/${accountId}/adspixels`, {
        params: {
          fields: 'id,name',
        },
      });
      const pixels = response.data.data || [];
      return pixels.length > 0 ? pixels[0].id : null;
    } catch (error: any) {
      console.warn('[FacebookApiService.getAdsPixelId] Failed to fetch pixel ID:', error.message);
      return null;
    }
  }

  /**
   * Get Ads Pixel Stats with event counts
   * @param pixelId - The Ads Pixel ID
   * @param dateRange - Date range for stats
   */
  async getAdsPixelStats(
    pixelId: string,
    dateRange: { since: string; until: string }
  ): Promise<any> {
    try {
      const response = await this.api.get(`/${pixelId}/stats`, {
        params: {
          aggregation: 'event_total_counts',
          start_time: Math.floor(new Date(dateRange.since).getTime() / 1000),
          end_time: Math.floor(new Date(dateRange.until).getTime() / 1000),
        },
      });
      return response.data.data || [];
    } catch (error: any) {
      console.warn('[FacebookApiService.getAdsPixelStats] Failed to fetch pixel stats:', error.message);
      return [];
    }
  }
}


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

      const data = debugResponse.data?.data;
      console.log('[FacebookApiService.debugToken] Token info:', {
        app_id: data?.app_id,
        type: data?.type,
        is_valid: data?.is_valid,
        scopes: data?.scopes,
        expires_at: data?.expires_at,
        user_id: data?.user_id,
      });
    } catch (err: any) {
      console.warn(
        '[FacebookApiService.debugToken] Failed to debug token:',
        err.response?.data || err.message
      );
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
      console.log('[FacebookApiService.createAdset] Request:', {
        accountId,
        adsetData: JSON.stringify(adsetData, null, 2),
      });
      const response = await this.api.post(`/${accountId}/adsets`, adsetData);
      const adsetId = response.data.id;
      console.log('[FacebookApiService.createAdset] Success:', {
        adsetId,
        response: response.data,
      });
      
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
      console.log('[FacebookApiService.uploadAdImage] Request', {
        accountId,
        imageUrl,
      });
      
      // Fetch the image from the URL and convert to base64 (API v24.0 requires bytes parameter)
      console.log('[FacebookApiService.uploadAdImage] Fetching image from URL...');
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 second timeout
      });
      
      const imageBuffer = Buffer.from(imageResponse.data);
      const base64Image = imageBuffer.toString('base64');
      
      console.log('[FacebookApiService.uploadAdImage] Image fetched, size:', imageBuffer.length, 'bytes');
      
      // Upload using bytes parameter (API v24.0)
      const response = await this.api.post(`/${accountId}/adimages`, {
        bytes: base64Image,
      });
      
      console.log('[FacebookApiService.uploadAdImage] Response data', response.data);
      
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
      console.log('[FacebookApiService.createAdCreative] Success:', {
        creativeId,
        response: response.data,
      });
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
      console.log('[FacebookApiService.createAd] Request:', {
        accountId,
        adData: JSON.stringify(adData, null, 2),
      });
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


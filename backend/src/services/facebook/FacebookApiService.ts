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

export class FacebookApiService {
  private api: AxiosInstance;
  private accessToken: string;
  private apiVersion = 'v18.0';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
    this.api = axios.create({
      baseURL: `https://graph.facebook.com/${this.apiVersion}`,
      params: {
        access_token: accessToken,
      },
    });
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
      return response.data.id;
    } catch (error: any) {
      throw new Error(
        `Failed to create adset: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  async uploadAdImage(accountId: string, imageUrl: string): Promise<string> {
    try {
      // Method 1: Try URL-based upload (simplest)
      const response = await this.api.post(`/${accountId}/adimages`, {
        url: imageUrl,
      });
      
      if (response.data.images && response.data.images[0]) {
        return response.data.images[0].hash;
      }
      
      throw new Error('No image hash returned from Facebook');
    } catch (error: any) {
      const errorCode = error.response?.data?.error?.code;
      const errorMessage = error.response?.data?.error?.message || error.message;
      
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

  async createAd(adsetId: string, adData: any): Promise<string> {
    try {
      const response = await this.api.post(`/${adsetId}/ads`, adData);
      return response.data.id;
    } catch (error: any) {
      throw new Error(
        `Failed to create ad: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  async getAdInsights(adId: string, dateRange: { since: string; until: string }): Promise<any> {
    try {
      const response = await this.api.get(`/${adId}/insights`, {
        params: {
          fields: 'impressions,clicks,ctr,spend,actions',
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
}


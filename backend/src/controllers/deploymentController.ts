import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AdCombination } from '../models/AdCombination';
import { Adset } from '../models/Adset';
import { FacebookAccount } from '../models/FacebookAccount';
import { FacebookApiService } from '../services/facebook/FacebookApiService';

export const deployAds = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { adsetId, combinationIds, status = 'PAUSED' } = req.body;

    if (!adsetId || !combinationIds || combinationIds.length === 0) {
      res.status(400).json({ error: 'Adset ID and combination IDs are required' });
      return;
    }

    const adset = await Adset.findById(adsetId).populate('campaignId');
    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    const campaign = (adset.campaignId as any);
    const facebookAccount = await FacebookAccount.findById(campaign.facebookAccountId);
    if (!facebookAccount) {
      res.status(404).json({ error: 'Facebook account not found' });
      return;
    }

    const apiService = new FacebookApiService(facebookAccount.accessToken);
    
    // Get Facebook Page ID (required for ad creation)
    let pageId: string | null = null;
    try {
      const pages = await apiService.getPages();
      if (pages && pages.length > 0) {
        pageId = pages[0].id;
      } else {
        throw new Error('No Facebook pages found. Please connect a Facebook page to your account.');
      }
    } catch (error: any) {
      res.status(400).json({ 
        error: 'Failed to get Facebook page',
        details: error.message || 'Please ensure you have a connected Facebook page'
      });
      return;
    }

    // Create adset if not exists on Facebook (do this ONCE before the loop)
    let facebookAdsetId = adset.facebookAdsetId;
    if (!facebookAdsetId) {
          // Build comprehensive adset data with all settings
          const adsetData: any = {
            name: adset.name,
            campaign_id: campaign.facebookCampaignId,
            targeting: {
              age_min: adset.targeting.ageMin,
              age_max: adset.targeting.ageMax,
              genders: adset.targeting.genders,
              geo_locations: {
                countries: adset.targeting.locations || [],
              },
              interests: adset.targeting.interests?.map((name) => ({ name })) || [],
              behaviors: adset.targeting.behaviors?.map((name) => ({ name })) || [],
              publisher_platforms: adset.targeting.placements || ['facebook', 'instagram'],
            },
            daily_budget: (adset.dailyBudget || adset.budget) * 100, // Convert to cents
            status: adset.status,
          };

          // Add optimization and conversion settings
          if (adset.optimizationGoal) {
            adsetData.optimization_goal = adset.optimizationGoal;
          }
          if (adset.billingEvent) {
            adsetData.billing_event = adset.billingEvent;
          }
          if (adset.bidStrategy) {
            adsetData.bid_strategy = adset.bidStrategy;
          }
          if (adset.bidAmount) {
            adsetData.bid_amount = adset.bidAmount;
          }
          if (adset.promotedObject) {
            adsetData.promoted_object = adset.promotedObject;
          }
          if (adset.attributionSpec) {
            adsetData.attribution_spec = adset.attributionSpec;
          }
          // conversion_specs is not available on AdSet API - conversion info is in promoted_object
          // if (adset.conversionSpecs) {
          //   adsetData.conversion_specs = adset.conversionSpecs;
          // }
          if (adset.startTime) {
            adsetData.start_time = adset.startTime;
          }
          if (adset.endTime) {
            adsetData.end_time = adset.endTime;
          }
          if (adset.lifetimeBudget) {
            adsetData.lifetime_budget = adset.lifetimeBudget * 100; // Convert to cents
          }

      try {
        facebookAdsetId = await apiService.createAdset(
          `act_${facebookAccount.accountId}`,
          adsetData
        );
        adset.facebookAdsetId = facebookAdsetId;
        await adset.save();
      } catch (error: any) {
        console.error('Failed to create adset:', error);
        res.status(400).json({
          error: 'Failed to create adset',
          details: error.message || 'Invalid adset parameters',
          adsetData: adsetData,
        });
        return;
      }
    }

    const deployedAds = [];
    const errors = [];

    // Now create ads for each combination
    for (const combinationId of combinationIds) {
      try {
        const combination = await AdCombination.findById(combinationId)
          .populate('assetIds')
          .populate('headlineId')
          .populate('hookId')
          .populate('bodyId')
          .populate('descriptionId')
          .populate('ctaId');

        if (!combination) {
          errors.push({ combinationId, error: 'Combination not found' });
          continue;
        }

        // Get landing page URL from combination or adset
        const landingPageUrl = combination.url || (adset as any).contentData?.landingPageUrl || '';
        if (!landingPageUrl) {
          errors.push({ 
            combinationId, 
            error: 'Landing page URL is required. Please set it in Content Data or combination.' 
          });
          continue;
        }

        // Get asset
        const asset = Array.isArray(combination.assetIds) && combination.assetIds.length > 0
          ? combination.assetIds[0] as any
          : null;

        if (!asset || asset.type !== 'image') {
          errors.push({ combinationId, error: 'Combination must have at least one image asset' });
          continue;
        }

        // Upload image to get hash
        const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || process.env.API_URL || 'http://localhost:3001';
        let imageHash = asset.metadata?.facebookImageHash;
        
        if (!imageHash) {
          try {
            const imageUrl = asset.url.startsWith('http') 
              ? asset.url 
              : `${PUBLIC_BASE_URL}${asset.url}`;
            imageHash = await apiService.uploadAdImage(
              `act_${facebookAccount.accountId}`,
              imageUrl
            );
            // Save hash to asset metadata for future use
            asset.metadata = asset.metadata || {};
            asset.metadata.facebookImageHash = imageHash;
            await asset.save();
          } catch (error: any) {
            console.error(`Failed to upload image for combination ${combinationId}:`, error);
            errors.push({ 
              combinationId, 
              error: `Failed to upload image: ${error.message || 'Unknown error'}` 
            });
            continue;
          }
        }

        // Build ad body: hook + body + CTA (with empty lines)
        let adBody = '';
        const hook = combination.hookId as any;
        const body = combination.bodyId as any;
        const cta = combination.ctaId as any;
        
        if (hook?.content) {
          adBody += hook.content + '\n\n';
        }
        if (body?.content) {
          adBody += body.content;
        }
        if (cta?.content) {
          adBody += '\n\n' + cta.content;
        }

        // Get CTA type from combination
        const ctaType = combination.ctaType || 'LEARN_MORE';

        // Build creative spec
        const creativeSpec = {
          object_story_spec: {
            page_id: pageId,
            link_data: {
              image_hash: imageHash,
              link: landingPageUrl,
              message: adBody,
              name: (combination.headlineId as any)?.content || '',
              description: (combination.descriptionId as any)?.content || '',
              call_to_action: {
                type: ctaType,
              },
            },
          },
        };

        // Create ad
        try {
          const facebookAdId = await apiService.createAd(facebookAdsetId, {
            ...creativeSpec,
            status,
          });

          combination.deployedToFacebook = true;
          combination.facebookAdId = facebookAdId;
          await combination.save();

          deployedAds.push({
            combinationId: combination._id,
            facebookAdId,
          });
        } catch (adError: any) {
          console.error(`Failed to create ad for combination ${combinationId}:`, {
            error: adError.message,
            response: adError.response?.data,
            creativeSpec: creativeSpec,
          });
          
          // Extract detailed error information
          const fbError = adError.response?.data?.error;
          const errorMessage = fbError?.message || adError.message || 'Failed to create ad';
          const errorCode = fbError?.code;
          const errorType = fbError?.type;
          
          errors.push({
            combinationId,
            error: errorMessage,
            code: errorCode,
            type: errorType,
            details: fbError || undefined,
          });
        }
      } catch (error: any) {
        console.error(`Failed to process combination ${combinationId}:`, error);
        errors.push({
          combinationId,
          error: error.message || 'Failed to deploy',
        });
      }
    }

    res.json({
      success: true,
      deployed: deployedAds.length,
      failed: errors.length,
      deployedAds,
      errors,
    });
  } catch (error: any) {
    console.error('Deploy ads error:', error);
    res.status(500).json({ error: error.message || 'Failed to deploy ads' });
  }
};


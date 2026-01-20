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
    
    // Verify adset exists if we have an ID
    if (facebookAdsetId) {
      try {
        await apiService.getAdsetDetails(facebookAdsetId);
        console.log(`[deployAds] Verified existing adset ID: ${facebookAdsetId}`);
      } catch (error: any) {
        console.warn(`[deployAds] Adset ${facebookAdsetId} not found or inaccessible, will recreate:`, error.message);
        facebookAdsetId = undefined; // Reset to trigger recreation
        adset.facebookAdsetId = undefined;
        await adset.save();
      }
    }
    
    if (!facebookAdsetId) {
          // Build comprehensive adset data with all settings
          // Note: If campaign has budget, adsets don't need their own budget
          // Facebook will use campaign-level budget if adset budget is not provided
          const dailyBudget = (adset.dailyBudget || adset.budget || 0) * 100; // Convert to cents
          const lifetimeBudget = adset.lifetimeBudget ? adset.lifetimeBudget * 100 : undefined;

          // Build targeting object
          const targeting: any = {
            age_min: adset.targeting.ageMin || 18,
            age_max: adset.targeting.ageMax || 65,
            genders: adset.targeting.genders || [0], // Default to all genders
          };

          // Geo locations
          if (adset.targeting.locations && adset.targeting.locations.length > 0) {
            targeting.geo_locations = {
              countries: adset.targeting.locations,
            };
          }

          // Interests - only include if not empty
          if (adset.targeting.interests && adset.targeting.interests.length > 0) {
            targeting.interests = adset.targeting.interests.map((name) => ({ name }));
          }

          // Behaviors - only include if not empty
          if (adset.targeting.behaviors && adset.targeting.behaviors.length > 0) {
            targeting.behaviors = adset.targeting.behaviors.map((name) => ({ name }));
          }

          // Publisher platforms - default to facebook and instagram if empty
          const placements = adset.targeting.placements && adset.targeting.placements.length > 0
            ? adset.targeting.placements
            : ['facebook', 'instagram'];
          targeting.publisher_platforms = placements;

          const adsetData: any = {
            name: adset.name,
            campaign_id: campaign.facebookCampaignId,
            targeting: targeting,
            status: adset.status || 'PAUSED',
          };

          // Add budget (daily or lifetime, but not both)
          // Only add adset-level budget if it exists and campaign doesn't have budget
          // If campaign has budget, adsets inherit it and don't need their own
          if (lifetimeBudget) {
            adsetData.lifetime_budget = lifetimeBudget;
          } else if (dailyBudget > 0) {
            adsetData.daily_budget = dailyBudget;
          }
          // If neither adset budget exists and campaign has budget, don't include budget field
          // Facebook will use campaign-level budget

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
          if (adset.attributionSpec && adset.attributionSpec.length > 0) {
            adsetData.attribution_spec = adset.attributionSpec;
          }
          
          // Start time - Facebook API expects Unix timestamp (seconds since epoch)
          // Only include if it's in the future or very recent (within last hour)
          if (adset.startTime) {
            let startTimeValue: number;
            if (typeof adset.startTime === 'string') {
              const startTime = new Date(adset.startTime);
              const now = new Date();
              // If start time is more than 1 hour in the past, use current time
              if (startTime.getTime() < now.getTime() - 3600000) {
                startTimeValue = Math.floor(now.getTime() / 1000);
              } else {
                startTimeValue = Math.floor(startTime.getTime() / 1000);
              }
            } else {
              // Already a timestamp
              startTimeValue = adset.startTime;
            }
            adsetData.start_time = startTimeValue;
          }
          
          // End time - only include if provided
          if (adset.endTime) {
            adsetData.end_time = adset.endTime;
          }

      try {
        facebookAdsetId = await apiService.createAdset(
          `act_${facebookAccount.accountId}`,
          adsetData
        );
        console.log(`[deployAds] Created adset with ID: ${facebookAdsetId}`);
        
        // Verify the adset exists before saving
        try {
          await apiService.getAdsetDetails(facebookAdsetId);
          adset.facebookAdsetId = facebookAdsetId;
          await adset.save();
          console.log(`[deployAds] Verified and saved adset ID: ${facebookAdsetId}`);
        } catch (verifyError: any) {
          console.error(`[deployAds] Failed to verify created adset ${facebookAdsetId}:`, verifyError);
          throw new Error(`Adset was created but cannot be accessed: ${verifyError.message}`);
        }
      } catch (error: any) {
        console.error('Failed to create adset:', error);
        res.status(400).json({
          error: 'Failed to create adset',
          details: error.message || 'Invalid adset parameters',
          adsetData: adsetData,
        });
        return;
      }
    } else {
      console.log(`[deployAds] Using existing adset ID: ${facebookAdsetId}`);
    }
    
    // Final verification that we have a valid adset ID before creating ads
    if (!facebookAdsetId) {
      res.status(400).json({
        error: 'No valid adset ID available',
        details: 'Failed to create or verify adset',
      });
      return;
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
          console.log(`[deployAds] Creating ad for combination ${combinationId} in adset ${facebookAdsetId}`);
          const facebookAdId = await apiService.createAd(facebookAdsetId, {
            ...creativeSpec,
            status,
          });
          console.log(`[deployAds] Successfully created ad ${facebookAdId} for combination ${combinationId}`);

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


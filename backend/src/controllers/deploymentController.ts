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
    const deployedAds = [];
    const errors = [];

    for (const combinationId of combinationIds) {
      try {
        const combination = await AdCombination.findById(combinationId)
          .populate('assetIds')
          .populate('headlineId')
          .populate('bodyId')
          .populate('descriptionId')
          .populate('ctaId');

        if (!combination) {
          errors.push({ combinationId, error: 'Combination not found' });
          continue;
        }

        // Create adset if not exists on Facebook
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

          facebookAdsetId = await apiService.createAdset(
            `act_${facebookAccount.accountId}`,
            adsetData
          );
          adset.facebookAdsetId = facebookAdsetId;
          await adset.save();
        }

        // Upload assets
        const asset = combination.assetIds[0];
        let creativeSpec: any = {};

        if (asset.type === 'image') {
          const imageHash = await apiService.uploadAdImage(
            `act_${facebookAccount.accountId}`,
            `${process.env.API_URL || 'http://localhost:3001'}${asset.url}`
          );
          creativeSpec = {
            object_story_spec: {
              page_id: facebookAccount.accountId, // You'd need to store page ID
              link_data: {
                image_hash: imageHash,
                link: 'https://example.com', // Landing page URL
                message: combination.bodyId.content,
                name: combination.headlineId.content,
                description: combination.descriptionId.content,
                call_to_action: {
                  type: 'LEARN_MORE',
                  value: {
                    link: 'https://example.com',
                  },
                },
              },
            },
          };
        }

        // Create ad with optional Meta AI features
        // Meta AI features (text generation, image expansion) are enabled via degrees_of_freedom_spec
        // when creating the creative. For now, we create the ad normally.
        // To enable Meta AI, you would need to create the creative first with AI features,
        // then use that creative when creating the ad.
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
      } catch (error: any) {
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


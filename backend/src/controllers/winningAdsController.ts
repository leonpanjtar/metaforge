import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Adset } from '../models/Adset';
import { AdCombination } from '../models/AdCombination';
import { FacebookAccount } from '../models/FacebookAccount';
import { FacebookApiService } from '../services/facebook/FacebookApiService';
import { Asset } from '../models/Asset';
import { AdCopy } from '../models/AdCopy';
import { Campaign } from '../models/Campaign';
import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';

// Helper to extract lead outcomes (OUTCOME_LEADS) from Facebook insights
function extractLeadOutcomes(insights: any): number {
  // 1) Some accounts expose a generic `results` field when objective = OUTCOME_LEADS
  //    In that case, `results` already represents the number of leads.
  const genericResults = Number(insights?.results ?? 0);
  if (!Number.isNaN(genericResults) && genericResults > 0) {
    return genericResults;
  }

  // 2) Some responses may include `objective_results` with per-objective breakdown
  const objectiveResults = insights?.objective_results;
  if (Array.isArray(objectiveResults)) {
    let total = 0;
    for (const obj of objectiveResults) {
      const name = (obj.name || obj.objective || '').toString().toLowerCase();
      if (name.includes('lead')) {
        const value = Number(obj.value || 0);
        if (!Number.isNaN(value)) {
          total += value;
        }
      }
    }
    if (total > 0) {
      return total;
    }
  }

  // 3) Fallback: look at actions with type containing 'lead'
  const actions = insights?.actions;
  if (Array.isArray(actions)) {
    let total = 0;
    for (const action of actions) {
      const type = (action.action_type || '').toString().toLowerCase();
      if (type.includes('lead')) {
        const value = Number(action.value || 0);
        if (!Number.isNaN(value)) {
          total += value;
        }
      }
    }
    return total;
  }

  return 0;
}

export const getWinningAds = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { since, until } = req.query as { since?: string; until?: string };

    const endDate = until ? new Date(until) : new Date();
    const startDate = since ? new Date(since) : new Date(endDate);
    if (!since) {
      // default to last 3 months from today
      startDate.setMonth(endDate.getMonth() - 3);
    }

    const dateRange = {
      since: startDate.toISOString().split('T')[0],
      until: endDate.toISOString().split('T')[0],
    };

    // Get all campaigns for this user that have OUTCOME_LEADS as objective
    const leadCampaigns = await Campaign.find({
      userId: req.userId,
      objective: /OUTCOME_LEADS/i,
    });

    const leadCampaignIds = leadCampaigns.map((c) => c._id);
    if (leadCampaignIds.length === 0) {
      res.json({ ads: [] });
      return;
    }

    // Get all adsets for this user within those lead campaigns
    const adsets = await Adset.find({
      userId: req.userId,
      campaignId: { $in: leadCampaignIds },
    }).populate('campaignId');
    const adsetIds = adsets.map((a) => a._id);

    if (adsetIds.length === 0) {
      res.json({ ads: [] });
      return;
    }

    // Map adsetId -> adset & campaign info for quick lookup
    const adsetMap = new Map<string, any>();
    for (const adset of adsets) {
      adsetMap.set(adset._id.toString(), adset);
    }

    // Get all deployed combinations that have a Facebook ad ID
    const combinations = await AdCombination.find({
      adsetId: { $in: adsetIds },
      deployedToFacebook: true,
      facebookAdId: { $exists: true, $ne: null },
    });

    if (combinations.length === 0) {
      res.json({ ads: [] });
      return;
    }

    // Assume all adsets for this user belong to the same Facebook account (first one)
    // We just need a token; account-specific info comes from each combination's campaign/adset
    const firstAdset: any = adsets[0];
    const campaign: any = firstAdset.campaignId;
    const facebookAccount = await FacebookAccount.findById(campaign.facebookAccountId);
    if (!facebookAccount) {
      res.status(400).json({ error: 'Facebook account not found for user campaigns' });
      return;
    }

    const apiService = new FacebookApiService(facebookAccount.accessToken);

    const results: any[] = [];

    for (const combo of combinations) {
      if (!combo.facebookAdId) continue;

      try {
        // Log the exact query for Graph Explorer testing
        const accountIdWithPrefix = facebookAccount.accountId.startsWith('act_')
          ? facebookAccount.accountId
          : `act_${facebookAccount.accountId}`;
        const adId = combo.facebookAdId;
        const endpoint = `/${adId}/insights`;
        const fields = 'impressions,clicks,ctr,spend,actions,results,objective_results';
        const timeRange = JSON.stringify(dateRange);
        
        console.log(`[getWinningAds][GraphExplorer] Query for ad ${adId}:`, {
          endpoint: `https://graph.facebook.com/v24.0${endpoint}`,
          method: 'GET',
          params: {
            fields,
            time_range: timeRange,
            access_token: '<ACCESS_TOKEN>',
          },
          exampleCurl: `curl -X GET "https://graph.facebook.com/v24.0${endpoint}?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&access_token=<ACCESS_TOKEN>"`,
        });
        
        const insights = await apiService.getAdInsights(adId, dateRange);

        const impressions = Number(insights.impressions || 0);
        const clicks = Number(insights.clicks || 0);
        const spend = Number(insights.spend || 0);
        const leads = extractLeadOutcomes(insights);
        const costPerLead = leads > 0 ? spend / leads : 0;

        const adset = adsetMap.get(combo.adsetId.toString());
        const campaignForAdset = adset?.campaignId;

        // Build a link to the ad in Facebook Ads Manager for preview
        const accountId = facebookAccount.accountId.startsWith('act_')
          ? facebookAccount.accountId.replace('act_', '')
          : facebookAccount.accountId;
        const facebookAdLink = `https://www.facebook.com/adsmanager/manage/ads?act=${accountId}&selected_ad_ids[0]=${combo.facebookAdId}`;

        results.push({
          combinationId: combo._id,
          facebookAdId: combo.facebookAdId,
          adsetId: combo.adsetId,
          campaignName: campaignForAdset?.name || '',
          adsetName: adset?.name || '',
          impressions,
          clicks,
          spend,
          leads,
          costPerLead,
          url: combo.url || adset?.contentData?.landingPageUrl || '',
          facebookAdLink,
          dateRange,
        });
      } catch (error: any) {
        console.error(`Failed to fetch insights for ad ${combo.facebookAdId}:`, error);
      }
    }

    // Sort by cost per lead ascending (best first)
    results.sort((a, b) => a.costPerLead - b.costPerLead);

    res.json({ ads: results });
  } catch (error: any) {
    console.error('getWinningAds error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch winning ads' });
  }
};

export const getAdDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { facebookAdId } = req.params;

    // Find the combination to get the adset and account info
    const combination = await AdCombination.findOne({ facebookAdId }).populate('adsetId');
    if (!combination) {
      res.status(404).json({ error: 'Ad not found' });
      return;
    }

    const adset = await Adset.findById((combination.adsetId as any)._id).populate('campaignId');
    if (!adset || (adset.userId as any).toString() !== req.userId) {
      res.status(404).json({ error: 'Adset not found or access denied' });
      return;
    }

    const campaign: any = adset.campaignId;
    const facebookAccount = await FacebookAccount.findById(campaign.facebookAccountId);
    if (!facebookAccount) {
      res.status(404).json({ error: 'Facebook account not found' });
      return;
    }

    const apiService = new FacebookApiService(facebookAccount.accessToken);

    // Get ad details
    const adDetails = await apiService.getAdDetails(facebookAdId);
    
    // Extract creative ID from ad details
    const creativeId = adDetails.creative?.id;
    if (!creativeId) {
      res.status(400).json({ error: 'Creative ID not found in ad details' });
      return;
    }

    // Get creative details
    const creativeDetails = await apiService.getAdCreativeDetails(creativeId);
    
    // Get adset targeting
    const adsetDetails = await apiService.getAdsetDetails(adDetails.adset_id);

    // Extract creative content from object_story_spec
    const objectStorySpec = creativeDetails.object_story_spec;
    const linkData = objectStorySpec?.link_data || {};
    
    // Extract CTA type
    const ctaType = linkData.call_to_action?.type || 'LEARN_MORE';
    
    // Extract image hash/URL
    const imageHash = linkData.image_hash;
    const imageUrl = imageHash ? `https://graph.facebook.com/v24.0/${imageHash}` : null;

    // Build response
    const details = {
      creative: {
        headline: linkData.name || '',
        body: linkData.message || '',
        description: linkData.description || '',
        ctaButton: ctaType,
        imageHash,
        imageUrl,
        link: linkData.link || '',
      },
      adsetTargeting: {
        ageMin: adsetDetails.targeting?.age_min,
        ageMax: adsetDetails.targeting?.age_max,
        genders: adsetDetails.targeting?.genders,
        locations: adsetDetails.targeting?.geo_locations?.countries || [],
        interests: adsetDetails.targeting?.interests?.map((i: any) => i.name || i) || [],
        behaviors: adsetDetails.targeting?.behaviors?.map((b: any) => b.name || b) || [],
        placements: adsetDetails.targeting?.publisher_platforms || [],
      },
    };

    res.json(details);
  } catch (error: any) {
    console.error('getAdDetails error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch ad details' });
  }
};

export const importWinningAd = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { facebookAdId, targetAdsetId } = req.body;

    if (!facebookAdId || !targetAdsetId) {
      res.status(400).json({ error: 'facebookAdId and targetAdsetId are required' });
      return;
    }

    // Verify target adset belongs to user
    const targetAdset = await Adset.findById(targetAdsetId);
    if (!targetAdset || (targetAdset.userId as any).toString() !== req.userId) {
      res.status(404).json({ error: 'Target adset not found or access denied' });
      return;
    }

    // Find the source combination
    const sourceCombination = await AdCombination.findOne({ facebookAdId }).populate('adsetId');
    if (!sourceCombination) {
      res.status(404).json({ error: 'Source ad not found' });
      return;
    }

    const sourceAdset = await Adset.findById((sourceCombination.adsetId as any)._id).populate('campaignId');
    if (!sourceAdset || (sourceAdset.userId as any).toString() !== req.userId) {
      res.status(404).json({ error: 'Source adset not found or access denied' });
      return;
    }

    const campaign: any = sourceAdset.campaignId;
    const facebookAccount = await FacebookAccount.findById(campaign.facebookAccountId);
    if (!facebookAccount) {
      res.status(404).json({ error: 'Facebook account not found' });
      return;
    }

    const apiService = new FacebookApiService(facebookAccount.accessToken);

    // Get ad details and creative
    const adDetails = await apiService.getAdDetails(facebookAdId);
    const creativeId = adDetails.creative?.id;
    if (!creativeId) {
      res.status(400).json({ error: 'Creative ID not found' });
      return;
    }

    const creativeDetails = await apiService.getAdCreativeDetails(creativeId);
    const linkData = creativeDetails.object_story_spec?.link_data || {};
    const adsetDetails = await apiService.getAdsetDetails(adDetails.adset_id);

    // Download image if we have an image hash
    let importedAssetId: string | null = null;
    if (linkData.image_hash) {
      try {
        // Get image URL from Facebook adimages endpoint
        const accountIdWithPrefix = facebookAccount.accountId.startsWith('act_')
          ? facebookAccount.accountId
          : `act_${facebookAccount.accountId}`;
        
        // Use axios directly to call Facebook API
        const adimagesResponse = await axios.get(
          `https://graph.facebook.com/v24.0/${accountIdWithPrefix}/adimages`,
          {
            params: {
              hashes: `['${linkData.image_hash}']`,
              access_token: facebookAccount.accessToken,
            },
          }
        );
        
        // Extract image URL from response
        const imageData = adimagesResponse.data?.images?.[linkData.image_hash];
        if (!imageData?.url) {
          throw new Error('Could not retrieve image URL from Facebook');
        }
        
        // Download the image
        const imageResponse = await axios.get(imageData.url, {
          responseType: 'arraybuffer',
        });
        const imageBuffer = Buffer.from(imageResponse.data);

        const filename = `imported-${facebookAdId}-${Date.now()}.jpg`;
        const uploadsDir = path.join(process.cwd(), 'uploads', targetAdsetId.toString());
        await fs.mkdir(uploadsDir, { recursive: true });
        const filepath = path.join(uploadsDir, filename);
        await fs.writeFile(filepath, imageBuffer);

        const asset = new Asset({
          adsetId: targetAdsetId,
          type: 'image',
          filename,
          filepath,
          url: `/uploads/${targetAdsetId}/${filename}`,
          metadata: {
            facebookImageHash: linkData.image_hash,
          },
        });
        await asset.save();
        importedAssetId = asset._id.toString();
      } catch (error: any) {
        console.error('Failed to download and save image:', error);
        // Continue without image - user can upload manually
      }
    }

    // Create AdCopy entries
    const copyEntries: any[] = [];
    
    if (linkData.name) {
      const headline = new AdCopy({
        adsetId: targetAdsetId,
        type: 'headline',
        content: linkData.name,
        variantIndex: 0,
        generatedByAI: false,
      });
      await headline.save();
      copyEntries.push({ type: 'headline', id: headline._id });
    }

    if (linkData.message) {
      const body = new AdCopy({
        adsetId: targetAdsetId,
        type: 'body',
        content: linkData.message,
        variantIndex: 0,
        generatedByAI: false,
      });
      await body.save();
      copyEntries.push({ type: 'body', id: body._id });
    }

    if (linkData.description) {
      const description = new AdCopy({
        adsetId: targetAdsetId,
        type: 'description',
        content: linkData.description,
        variantIndex: 0,
        generatedByAI: false,
      });
      await description.save();
      copyEntries.push({ type: 'description', id: description._id });
    }

    const ctaType = linkData.call_to_action?.type || 'LEARN_MORE';
    const ctaContent = linkData.call_to_action?.value?.link_caption || ctaType.replace(/_/g, ' ');
    const cta = new AdCopy({
      adsetId: targetAdsetId,
      type: 'cta',
      content: ctaContent,
      variantIndex: 0,
      generatedByAI: false,
    });
    await cta.save();
    copyEntries.push({ type: 'cta', id: cta._id });

    // Update target adset's contentData with landing page URL
    if (linkData.link) {
      targetAdset.contentData = targetAdset.contentData || {};
      targetAdset.contentData.landingPageUrl = linkData.link;
      await targetAdset.save();
    }

    // Optionally copy targeting if user wants (we'll just return it for now)
    const targeting = {
      ageMin: adsetDetails.targeting?.age_min,
      ageMax: adsetDetails.targeting?.age_max,
      genders: adsetDetails.targeting?.genders,
      locations: adsetDetails.targeting?.geo_locations?.countries || [],
      interests: adsetDetails.targeting?.interests?.map((i: any) => i.name || i) || [],
      behaviors: adsetDetails.targeting?.behaviors?.map((b: any) => b.name || b) || [],
      placements: adsetDetails.targeting?.publisher_platforms || [],
    };

    res.json({
      success: true,
      imported: {
        assetId: importedAssetId,
        copyEntries,
        landingPageUrl: linkData.link,
        ctaType,
        targeting,
      },
      message: 'Ad imported successfully. You can now create variants in the Adset Editor.',
    });
  } catch (error: any) {
    console.error('importWinningAd error:', error);
    res.status(500).json({ error: error.message || 'Failed to import ad' });
  }
};


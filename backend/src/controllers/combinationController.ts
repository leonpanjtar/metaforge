import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Adset } from '../models/Adset';
import { Asset } from '../models/Asset';
import { AdCopy } from '../models/AdCopy';
import { AdCombination } from '../models/AdCombination';
import { FacebookApiService } from '../services/facebook/FacebookApiService';
import { FacebookAccount } from '../models/FacebookAccount';
import { Campaign } from '../models/Campaign';
import { TokenRefreshService } from '../services/facebook/TokenRefreshService';

export const generateCombinations = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { adsetId } = req.params;
    const { 
      selectedAssets = [],
      selectedHooks = [],
      selectedBodies = [],
      selectedCTAs = [],
      selectedHeadlines = [],
      selectedDescriptions = [],
      selectedCTATypes = []
    } = req.body;

    const adset = await Adset.findOne({
      _id: adsetId,
      userId: req.userId,
    }).populate('contentData');

    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    // Fetch ONLY selected components (no fallback to all)
    // Validate that components are selected before fetching
    if (selectedAssets.length === 0) {
      res.status(400).json({ error: 'Please select at least one asset.' });
      return;
    }
    if (selectedHeadlines.length === 0) {
      res.status(400).json({ error: 'Please select at least one headline.' });
      return;
    }
    if (selectedBodies.length === 0) {
      res.status(400).json({ error: 'Please select at least one body.' });
      return;
    }
    if (selectedDescriptions.length === 0) {
      res.status(400).json({ error: 'Please select at least one description.' });
      return;
    }
    if (selectedCTAs.length === 0) {
      res.status(400).json({ error: 'Please select at least one CTA.' });
      return;
    }

    // Fetch only the selected components
    const assets = await Asset.find({ _id: { $in: selectedAssets }, adsetId });
    const headlines = await AdCopy.find({ _id: { $in: selectedHeadlines }, adsetId, type: 'headline' });
    const bodies = await AdCopy.find({ _id: { $in: selectedBodies }, adsetId, type: 'body' });
    const descriptions = await AdCopy.find({ _id: { $in: selectedDescriptions }, adsetId, type: 'description' });
    const ctas = await AdCopy.find({ _id: { $in: selectedCTAs }, adsetId, type: 'cta' });
    
    // Hooks are optional, so only fetch if selected
    const hooks = selectedHooks.length > 0
      ? await AdCopy.find({ _id: { $in: selectedHooks }, adsetId, type: 'hook' })
      : [];

    // Validate that fetched components match selected IDs (in case some IDs are invalid)
    if (assets.length !== selectedAssets.length) {
      res.status(400).json({ error: 'Some selected assets were not found.' });
      return;
    }
    if (headlines.length !== selectedHeadlines.length) {
      res.status(400).json({ error: 'Some selected headlines were not found.' });
      return;
    }
    if (bodies.length !== selectedBodies.length) {
      res.status(400).json({ error: 'Some selected bodies were not found.' });
      return;
    }
    if (descriptions.length !== selectedDescriptions.length) {
      res.status(400).json({ error: 'Some selected descriptions were not found.' });
      return;
    }
    if (ctas.length !== selectedCTAs.length) {
      res.status(400).json({ error: 'Some selected CTAs were not found.' });
      return;
    }

    // Get selected CTA types or use default
    const ctaTypes = selectedCTATypes.length > 0 
      ? selectedCTATypes 
      : ['LEARN_MORE']; // Default to LEARN_MORE if none selected

    // Get landing page URL from adset
    const landingPageUrl = (adset as any).contentData?.landingPageUrl || '';

    // Delete existing combinations for this adset
    await AdCombination.deleteMany({ adsetId });

    // Generate all combinations (without scoring for speed)
    // Scoring can be done asynchronously later if needed
    const combinationDocs = [];

    for (const asset of assets) {
      for (const headline of headlines) {
        for (const body of bodies) {
          for (const description of descriptions) {
            for (const cta of ctas) {
              // For each hook (if any), create a combination
              // If no hooks, create one combination without hook
              const hookList = hooks.length > 0 ? hooks : [null];
              
              for (const hook of hookList) {
                // For each CTA button type, create a combination
                for (const ctaType of ctaTypes) {
                  // Create combination with default scores (scoring can be done later)
                  const combination = new AdCombination({
                    adsetId,
                    assetIds: [asset._id],
                    headlineId: headline._id,
                    hookId: hook?._id,
                    bodyId: body._id,
                    descriptionId: description._id,
                    ctaId: cta._id,
                    ctaType: ctaType,
                    url: landingPageUrl,
                    scores: {
                      hook: 0,
                      alignment: 0,
                      fit: 0,
                      clarity: 0,
                      match: 0,
                    },
                    overallScore: 0,
                    predictedCTR: 0,
                    deployedToFacebook: false,
                  });

                  combinationDocs.push(combination);
                }
              }
            }
          }
        }
      }
    }

    // Bulk insert all combinations at once (much faster)
    if (combinationDocs.length > 0) {
      await AdCombination.insertMany(combinationDocs);
    }

    const combinations = combinationDocs;

    res.json({
      success: true,
      totalCombinations: combinations.length,
      combinations: combinations,
    });
  } catch (error: any) {
    console.error('Generate combinations error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate combinations' });
  }
};

export const getCombinations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { adsetId } = req.params;
    const { sortBy = 'overallScore', limit } = req.query;

    const adset = await Adset.findOne({
      _id: adsetId,
      userId: req.userId,
    });

    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    const sortOptions: any = {};
    if (sortBy === 'overallScore') {
      sortOptions.overallScore = -1;
    } else if (sortBy === 'predictedCTR') {
      sortOptions.predictedCTR = -1;
    }

    let query = AdCombination.find({ adsetId })
      .populate('assetIds')
      .populate('headlineId')
      .populate('hookId')
      .populate('bodyId')
      .populate('descriptionId')
      .populate('ctaId')
      .sort(sortOptions);

    // Only apply limit if explicitly provided
    if (limit) {
      query = query.limit(parseInt(limit as string));
    }

    const combinations = await query;

    res.json(combinations);
  } catch (error: any) {
    console.error('Get combinations error:', error);
    res.status(500).json({ error: 'Failed to fetch combinations' });
  }
};

export const previewCombination = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { adsetId, combinationId } = req.params;

    const adset = await Adset.findOne({
      _id: adsetId,
      userId: req.userId,
    }).populate('campaignId');

    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    const combination = await AdCombination.findOne({
      _id: combinationId,
      adsetId,
    })
      .populate('assetIds')
      .populate('headlineId')
      .populate('hookId')
      .populate('bodyId')
      .populate('descriptionId')
      .populate('ctaId');

    if (!combination) {
      res.status(404).json({ error: 'Combination not found' });
      return;
    }

    // Get Facebook account and page
    const campaign = adset.campaignId as any;
    const facebookAccount = await FacebookAccount.findById(campaign.facebookAccountId);
    
    if (!facebookAccount) {
      res.status(404).json({ error: 'Facebook account not found' });
      return;
    }

    // Refresh token if needed (pass the account object, not the ID)
    await TokenRefreshService.checkAndRefreshToken(facebookAccount);

    // Get updated account (refresh in case it was updated)
    const updatedAccount = await FacebookAccount.findById(facebookAccount._id);
    if (!updatedAccount) {
      res.status(404).json({ error: 'Facebook account not found' });
      return;
    }

    // Get Facebook page
    const facebookApi = new FacebookApiService(updatedAccount.accessToken);
    const pages = await facebookApi.getPages();
    
    if (!pages || pages.length === 0) {
      res.status(400).json({ error: 'No Facebook pages found. Please connect a Facebook page.' });
      return;
    }

    const pageId = pages[0].id;

    // Build creative spec
    const asset = (combination.assetIds as any[])[0];
    const headline = combination.headlineId as any;
    const hook = combination.hookId as any;
    const body = combination.bodyId as any;
    const description = combination.descriptionId as any;
    const cta = combination.ctaId as any;

    // Build ad body: hook + body + CTA (with empty lines)
    let adBody = '';
    if (hook?.content) {
      adBody += hook.content + '\n\n';
    }
    if (body?.content) {
      adBody += body.content;
    }
    if (cta?.content) {
      adBody += '\n\n' + cta.content;
    }

    // Ensure accountId has 'act_' prefix for Facebook API
    const adAccountId = updatedAccount.accountId.startsWith('act_') 
      ? updatedAccount.accountId 
      : `act_${updatedAccount.accountId}`;

    // Get image URL - need to upload to Facebook first to get hash
    const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || process.env.API_URL || 'http://localhost:3001';
    let imageHash = asset.metadata?.facebookImageHash;

    if (!imageHash && asset.url) {
      try {
        // Upload image to get hash
        const imageUrl = asset.url.startsWith('http') 
          ? asset.url 
          : `${PUBLIC_BASE_URL}${asset.url}`;
        imageHash = await facebookApi.uploadAdImage(adAccountId, imageUrl);
      } catch (error: any) {
        console.error('Failed to upload image for preview:', error);
        // Continue without hash - preview might still work
      }
    }

    // Use the selected CTA type from combination, or fallback to LEARN_MORE
    const ctaType = combination.ctaType || 'LEARN_MORE';

    const creativeSpec = {
      objectStorySpec: {
        page_id: pageId,
        link_data: {
          image_hash: imageHash || '',
          link: combination.url || (adset as any).contentData?.landingPageUrl || '',
          message: adBody,
          name: headline?.content || '',
          description: description?.content || '',
          call_to_action: {
            type: ctaType,
          },
        },
      },
      pageId: pageId,
    };

    // Generate preview (generate for mobile feed first)
    const previews = await facebookApi.generateAIPreviews(
      adAccountId,
      creativeSpec,
      'MOBILE_FEED_STANDARD'
    );

    res.json({
      success: true,
      previews: previews,
      combination: {
        headline: headline?.content,
        body: adBody,
        description: description?.content,
        cta: cta?.content,
        url: combination.url || (adset as any).contentData?.landingPageUrl,
        imageUrl: asset.url,
      },
    });
  } catch (error: any) {
    console.error('Preview combination error:', error);
    res.status(500).json({ 
      error: 'Failed to generate preview',
      details: error.message || 'Unknown error'
    });
  }
};

export const updateCombination = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { adsetId, combinationId } = req.params;
    const { ctaType } = req.body;

    const adset = await Adset.findOne({
      _id: adsetId,
      userId: req.userId,
    });

    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    const combination = await AdCombination.findOne({
      _id: combinationId,
      adsetId,
    });

    if (!combination) {
      res.status(404).json({ error: 'Combination not found' });
      return;
    }

    if (ctaType !== undefined) {
      combination.ctaType = ctaType;
      await combination.save();
    }

    res.json({ success: true, combination });
  } catch (error: any) {
    console.error('Update combination error:', error);
    res.status(500).json({ error: 'Failed to update combination' });
  }
};

export const deleteCombination = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { adsetId, combinationId } = req.params;

    const adset = await Adset.findOne({
      _id: adsetId,
      userId: req.userId,
    });

    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    const combination = await AdCombination.findOne({
      _id: combinationId,
      adsetId,
    });

    if (!combination) {
      res.status(404).json({ error: 'Combination not found' });
      return;
    }

    await AdCombination.findByIdAndDelete(combinationId);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete combination error:', error);
    res.status(500).json({ error: 'Failed to delete combination' });
  }
};

export const deleteCombinationsBulk = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { adsetId } = req.params;
    const { combinationIds } = req.body;

    if (!Array.isArray(combinationIds) || combinationIds.length === 0) {
      res.status(400).json({ error: 'combinationIds must be a non-empty array' });
      return;
    }

    const adset = await Adset.findOne({
      _id: adsetId,
      userId: req.userId,
    });

    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    const result = await AdCombination.deleteMany({
      _id: { $in: combinationIds },
      adsetId,
    });

    res.json({ 
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (error: any) {
    console.error('Delete combinations bulk error:', error);
    res.status(500).json({ error: 'Failed to delete combinations' });
  }
};


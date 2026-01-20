import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Adset } from '../models/Adset';
import { Asset } from '../models/Asset';
import { AdCopy } from '../models/AdCopy';
import { AdCombination } from '../models/AdCombination';
import { ScoringService } from '../services/ai/ScoringService';
import { FacebookApiService } from '../services/facebook/FacebookApiService';
import { FacebookAccount } from '../models/FacebookAccount';
import { Campaign } from '../models/Campaign';
import { TokenRefreshService } from '../services/facebook/TokenRefreshService';

// Lazy initialization - only create when needed
const getScoringService = () => new ScoringService();

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
      selectedDescriptions = []
    } = req.body;

    const adset = await Adset.findOne({
      _id: adsetId,
      userId: req.userId,
    }).populate('contentData');

    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    // Fetch selected components (or all if none selected)
    const assets = selectedAssets.length > 0
      ? await Asset.find({ _id: { $in: selectedAssets }, adsetId })
      : await Asset.find({ adsetId });
    
    const hooks = selectedHooks.length > 0
      ? await AdCopy.find({ _id: { $in: selectedHooks }, adsetId, type: 'hook' })
      : await AdCopy.find({ adsetId, type: 'hook' });
    
    const headlines = selectedHeadlines.length > 0
      ? await AdCopy.find({ _id: { $in: selectedHeadlines }, adsetId, type: 'headline' })
      : await AdCopy.find({ adsetId, type: 'headline' });
    
    const bodies = selectedBodies.length > 0
      ? await AdCopy.find({ _id: { $in: selectedBodies }, adsetId, type: 'body' })
      : await AdCopy.find({ adsetId, type: 'body' });
    
    const descriptions = selectedDescriptions.length > 0
      ? await AdCopy.find({ _id: { $in: selectedDescriptions }, adsetId, type: 'description' })
      : await AdCopy.find({ adsetId, type: 'description' });
    
    const ctas = selectedCTAs.length > 0
      ? await AdCopy.find({ _id: { $in: selectedCTAs }, adsetId, type: 'cta' })
      : await AdCopy.find({ adsetId, type: 'cta' });

    // Validate required components
    if (assets.length === 0) {
      res.status(400).json({ error: 'At least one asset is required.' });
      return;
    }
    if (headlines.length === 0) {
      res.status(400).json({ error: 'At least one headline is required.' });
      return;
    }
    if (bodies.length === 0) {
      res.status(400).json({ error: 'At least one body is required.' });
      return;
    }
    if (descriptions.length === 0) {
      res.status(400).json({ error: 'At least one description is required.' });
      return;
    }
    if (ctas.length === 0) {
      res.status(400).json({ error: 'At least one CTA is required.' });
      return;
    }

    // Get landing page URL from adset
    const landingPageUrl = (adset as any).contentData?.landingPageUrl || '';

    // Delete existing combinations for this adset
    await AdCombination.deleteMany({ adsetId });

    // Generate all combinations
    const combinations = [];
    const scoringService = getScoringService();

    for (const asset of assets) {
      for (const headline of headlines) {
        for (const body of bodies) {
          for (const description of descriptions) {
            for (const cta of ctas) {
              // For each hook (if any), create a combination
              // If no hooks, create one combination without hook
              const hookList = hooks.length > 0 ? hooks : [null];
              
              for (const hook of hookList) {
                try {
                  // Score the combination
                  const scoring = await scoringService.scoreCombination(
                    asset,
                    headline,
                    body,
                    description,
                    cta,
                    adset
                  );

                  const combination = new AdCombination({
                    adsetId,
                    assetIds: [asset._id],
                    headlineId: headline._id,
                    hookId: hook?._id,
                    bodyId: body._id,
                    descriptionId: description._id,
                    ctaId: cta._id,
                    url: landingPageUrl,
                    scores: scoring.scores,
                    overallScore: scoring.overallScore,
                    predictedCTR: scoring.predictedCTR,
                    deployedToFacebook: false,
                  });

                  await combination.save();
                  combinations.push(combination);
                } catch (error: any) {
                  console.error(`Error creating combination:`, error);
                  // Continue with next combination
                }
              }
            }
          }
        }
      }
    }

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

    // Refresh token if needed
    await TokenRefreshService.checkAndRefreshToken(facebookAccount._id.toString());

    // Get updated account
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

    // Get image URL - need to upload to Facebook first to get hash
    const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || process.env.API_URL || 'http://localhost:3001';
    let imageHash = asset.metadata?.facebookImageHash;

    if (!imageHash && asset.url) {
      try {
        // Upload image to get hash
        const imageUrl = asset.url.startsWith('http') 
          ? asset.url 
          : `${PUBLIC_BASE_URL}${asset.url}`;
        imageHash = await facebookApi.uploadAdImage(updatedAccount.accountId, imageUrl);
      } catch (error: any) {
        console.error('Failed to upload image for preview:', error);
        // Continue without hash - preview might still work
      }
    }

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
            type: cta?.content?.toUpperCase().replace(/\s+/g, '_') || 'LEARN_MORE',
          },
        },
      },
      pageId: pageId,
    };

    // Generate preview (generate for mobile feed first)
    const previews = await facebookApi.generateAIPreviews(
      updatedAccount.accountId,
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


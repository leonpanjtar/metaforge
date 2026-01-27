import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { Adset } from '../models/Adset';
import { Asset } from '../models/Asset';
import { AdCopy } from '../models/AdCopy';
import { AdCombination } from '../models/AdCombination';
import { FacebookApiService } from '../services/facebook/FacebookApiService';
import { FacebookAccount } from '../models/FacebookAccount';
import { Campaign } from '../models/Campaign';
import { TokenRefreshService } from '../services/facebook/TokenRefreshService';
import { ScoringService } from '../services/ai/ScoringService';
import { getAccountFilter, getAccountUserIds } from '../utils/accountFilter';

export const generateCombinations = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { adsetId } = req.params;
    // Accept both formats: selectedAssets/assets, etc.
    const { 
      selectedAssets = [],
      selectedBodies = [],
      selectedHeadlines = [],
      selectedDescriptions = [],
      selectedCTATypes = [],
      // Also accept shorter format from frontend
      assets: assetsPayload = [],
      bodies: bodiesPayload = [],
      headlines: headlinesPayload = [],
      descriptions: descriptionsPayload = [],
      ctaTypes: ctaTypesPayload = []
    } = req.body;

    // Use selected* format if provided, otherwise use shorter format
    const finalSelectedAssets = selectedAssets.length > 0 ? selectedAssets : assetsPayload;
    const finalSelectedBodies = selectedBodies.length > 0 ? selectedBodies : bodiesPayload;
    const finalSelectedHeadlines = selectedHeadlines.length > 0 ? selectedHeadlines : headlinesPayload;
    const finalSelectedDescriptions = selectedDescriptions.length > 0 ? selectedDescriptions : descriptionsPayload;
    const finalSelectedCTATypes = selectedCTATypes.length > 0 ? selectedCTATypes : ctaTypesPayload;

    // Get account filter - query by accountId first, then fallback to userId
    const { getAccountFilter } = await import('../utils/accountFilter');
    const accountFilter = await getAccountFilter(req);
    
    const query: any = { _id: adsetId };
    
    if (accountFilter.accountId) {
      query.accountId = new mongoose.Types.ObjectId(accountFilter.accountId);
    } else {
      // Fallback to userId for backward compatibility
      query.userId = new mongoose.Types.ObjectId(accountFilter.userId);
    }

    const adset = await Adset.findOne(query).populate('contentData');

    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    // Fetch ONLY selected components (no fallback to all)
    // Validate that components are selected before fetching
    if (finalSelectedAssets.length === 0) {
      res.status(400).json({ error: 'Please select at least one asset.' });
      return;
    }
    if (finalSelectedHeadlines.length === 0) {
      res.status(400).json({ error: 'Please select at least one headline.' });
      return;
    }
    if (finalSelectedBodies.length === 0) {
      res.status(400).json({ error: 'Please select at least one body.' });
      return;
    }
    // Descriptions are optional - no validation needed

    // Fetch only the selected components
    const assets = await Asset.find({ _id: { $in: finalSelectedAssets }, adsetId });
    const headlines = await AdCopy.find({ _id: { $in: finalSelectedHeadlines }, adsetId, type: 'headline' });
    const bodies = await AdCopy.find({ _id: { $in: finalSelectedBodies }, adsetId, type: 'body' });
    const descriptions = finalSelectedDescriptions.length > 0 
      ? await AdCopy.find({ _id: { $in: finalSelectedDescriptions }, adsetId, type: 'description' })
      : [];

    // Validate that fetched components match selected IDs (in case some IDs are invalid)
    if (assets.length !== finalSelectedAssets.length) {
      res.status(400).json({ error: 'Some selected assets were not found.' });
      return;
    }
    if (headlines.length !== finalSelectedHeadlines.length) {
      res.status(400).json({ error: 'Some selected headlines were not found.' });
      return;
    }
    if (bodies.length !== finalSelectedBodies.length) {
      res.status(400).json({ error: 'Some selected bodies were not found.' });
      return;
    }
    // Only validate descriptions if any were selected
    if (finalSelectedDescriptions.length > 0 && descriptions.length !== finalSelectedDescriptions.length) {
      res.status(400).json({ error: 'Some selected descriptions were not found.' });
      return;
    }

    // Get selected CTA types or use default
    const ctaTypes = finalSelectedCTATypes.length > 0 
      ? finalSelectedCTATypes 
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
          // If descriptions are selected, use them; otherwise create combinations without descriptions
          if (descriptions.length > 0) {
            for (const description of descriptions) {
              // For each CTA button type, create a combination
              for (const ctaType of ctaTypes) {
                // Create combination with default scores (scoring can be done later)
                const combination = new AdCombination({
                  adsetId,
                  assetIds: [asset._id],
                  headlineId: headline._id,
                  bodyId: body._id,
                  descriptionId: description._id,
                  ctaType: ctaType,
                  url: landingPageUrl,
                  scores: {
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
          } else {
            // No descriptions selected - create combinations without descriptions
            for (const ctaType of ctaTypes) {
              // Create combination with default scores (scoring can be done later)
              const combination = new AdCombination({
                adsetId,
                assetIds: [asset._id],
                headlineId: headline._id,
                bodyId: body._id,
                descriptionId: undefined, // No description
                ctaType: ctaType,
                url: landingPageUrl,
                scores: {
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

export const scoreCombinations = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { adsetId } = req.params;
    const { minScore = 70 } = req.body; // Default minimum score is 70

    // Get all user IDs in the current account
    const accountUserIds = await getAccountUserIds(req);

    // Verify adset is in account
    const adset = await Adset.findOne({
      _id: adsetId,
      userId: { $in: accountUserIds },
    }).populate('contentData');

    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    // Fetch all combinations for this adset with populated fields
    const combinations = await AdCombination.find({ adsetId })
      .populate('assetIds')
      .populate('headlineId')
      .populate('bodyId')
      .populate('descriptionId')

    if (combinations.length === 0) {
      res.json({
        success: true,
        message: 'No combinations found to score',
        totalCombinations: 0,
        scored: 0,
        deleted: 0,
        kept: 0,
      });
      return;
    }

    // Set up Server-Sent Events for progressive updates
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    const sendSSE = (event: string, data: any) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const scoringService = new ScoringService();
      let scoredCount = 0;
      let deletedCount = 0;
      let keptCount = 0;
      const deletedIds: string[] = [];
      const total = combinations.length;

      // Send initial progress
      sendSSE('progress', {
        type: 'started',
        message: `Starting to score ${total} combinations...`,
        progress: 0,
        total: total,
        scored: 0,
        deleted: 0,
        kept: 0,
      });

      // Score each combination one at a time
      for (let i = 0; i < combinations.length; i++) {
        const combination = combinations[i];
        
        try {
          // Send progress update
          sendSSE('progress', {
            type: 'scoring',
            message: `Scoring combination ${i + 1} of ${total}...`,
            progress: i,
            total: total,
            currentIndex: i,
            scored: scoredCount,
            deleted: deletedCount,
            kept: keptCount,
          });

          // Get required components
          const asset = Array.isArray(combination.assetIds) && combination.assetIds.length > 0
            ? combination.assetIds[0] as any
            : null;
          const headline = combination.headlineId as any;
          const body = combination.bodyId as any;
          const description = combination.descriptionId as any;

          if (!asset || !headline || !body || !description) {
            console.error(`Combination ${combination._id} is missing required components`);
            sendSSE('error', {
              index: i,
              combinationId: combination._id.toString(),
              message: 'Missing required components',
            });
            continue;
          }

          // Score the combination
          const scoring = await scoringService.scoreCombination(
            asset,
            headline,
            body,
            description,
            adset as any
          );

          // Update combination with scores
          combination.scores = scoring.scores;
          combination.overallScore = scoring.overallScore;
          combination.predictedCTR = scoring.predictedCTR;
          await combination.save();

          scoredCount++;

          // Delete if score is below minimum
          if (scoring.overallScore < minScore) {
            await AdCombination.findByIdAndDelete(combination._id);
            deletedCount++;
            deletedIds.push(combination._id.toString());
            
            sendSSE('complete', {
              type: 'deleted',
              index: i,
              combinationId: combination._id.toString(),
              score: scoring.overallScore,
              message: `Combination ${i + 1} scored ${scoring.overallScore} (deleted)`,
              progress: i + 1,
              total: total,
              scored: scoredCount,
              deleted: deletedCount,
              kept: keptCount,
            });
          } else {
            keptCount++;
            
            sendSSE('complete', {
              type: 'kept',
              index: i,
              combinationId: combination._id.toString(),
              score: scoring.overallScore,
              message: `Combination ${i + 1} scored ${scoring.overallScore} (kept)`,
              progress: i + 1,
              total: total,
              scored: scoredCount,
              deleted: deletedCount,
              kept: keptCount,
            });
          }
        } catch (error: any) {
          console.error(`Error scoring combination ${combination._id}:`, error);
          sendSSE('error', {
            index: i,
            combinationId: combination._id.toString(),
            message: error.message || 'Failed to score combination',
          });
          // Continue with next combination
        }
      }

      // Send final completion
      sendSSE('done', {
        success: true,
        message: `Scored ${scoredCount} combinations. Deleted ${deletedCount} below score ${minScore}.`,
        totalCombinations: total,
        scored: scoredCount,
        deleted: deletedCount,
        kept: keptCount,
        deletedIds: deletedIds,
        minScore: minScore,
      });

      res.end();
    } catch (error: any) {
      console.error('Score combinations error:', error);
      sendSSE('error', {
        message: 'Failed to score combinations',
        details: error.message || 'Unknown error during scoring',
      });
      res.end();
    }
  } catch (error: any) {
    console.error('Score combinations error:', error);
    res.status(500).json({ error: error.message || 'Failed to score combinations' });
  }
};

export const getCombinations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { adsetId } = req.params;
    const { sortBy = 'overallScore', limit } = req.query;

    // Get account filter - query by accountId first, then fallback to userId
    const accountFilter = await getAccountFilter(req);
    
    const query: any = { _id: adsetId };
    
    if (accountFilter.accountId) {
      query.accountId = new mongoose.Types.ObjectId(accountFilter.accountId);
    } else {
      // Fallback to userId for backward compatibility
      query.userId = new mongoose.Types.ObjectId(accountFilter.userId);
    }

    const adset = await Adset.findOne(query);

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

    let combinationQuery = AdCombination.find({ adsetId })
      .populate('assetIds')
      .populate('headlineId')
      .populate('bodyId')
      .populate('descriptionId')
      .sort(sortOptions);

    // Only apply limit if explicitly provided
    if (limit) {
      combinationQuery = combinationQuery.limit(parseInt(limit as string));
    }

    const combinations = await combinationQuery;

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

    // Get all user IDs in the current account
    const accountUserIds = await getAccountUserIds(req);

    const adset = await Adset.findOne({
      _id: adsetId,
      userId: { $in: accountUserIds },
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
      .populate('bodyId')
      .populate('descriptionId')

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
    const body = combination.bodyId as any;
    const description = combination.descriptionId as any;

    // Build ad body
    const adBody = body?.content || '';

    // Ensure accountId has 'act_' prefix for Facebook API
    const adAccountId = updatedAccount.accountId.startsWith('act_') 
      ? updatedAccount.accountId 
      : `act_${updatedAccount.accountId}`;

    // Get image URL - need to upload to Facebook first to get hash
    const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || process.env.API_URL || 'http://localhost:3001';
    let imageHash = asset.metadata?.facebookImageHash;

    // Use the selected CTA type from combination, or fallback to LEARN_MORE
    const ctaType = combination.ctaType || 'LEARN_MORE';
    const landingPageUrl = combination.url || (adset as any).contentData?.landingPageUrl || '';

    let creativeSpec: any;

    if (asset.type === 'video') {
      // Handle video asset for preview
      let videoId = asset.metadata?.facebookVideoId;
      
      if (!videoId && asset.url) {
        try {
          const videoUrl = asset.url.startsWith('http') 
            ? asset.url 
            : `${PUBLIC_BASE_URL}${asset.url}`;
          videoId = await facebookApi.uploadAdVideo(adAccountId, videoUrl);
          // Save video ID to asset metadata for future use
          asset.metadata = asset.metadata || {};
          asset.metadata.facebookVideoId = videoId;
          await asset.save();
        } catch (error: any) {
          console.error('Failed to upload video for preview:', error);
          // Continue without video ID - preview might still work
        }
      }

      // Facebook requires image_hash or image_url in video_data for video thumbnails
      // Try to find a video thumbnail image asset first, then fall back to any image asset
      let thumbnailImageHash: string | null = null;
      
      try {
        // First, look for a video thumbnail image asset
        const thumbnailAsset = await Asset.findOne({
          adsetId: adset._id,
          type: 'image',
          'metadata.isVideoThumbnail': true,
          'metadata.facebookVideoId': videoId || asset.metadata?.facebookVideoId,
        });

        if (thumbnailAsset?.metadata?.facebookImageHash) {
          thumbnailImageHash = thumbnailAsset.metadata.facebookImageHash;
        } else if (thumbnailAsset?.url) {
          // Upload thumbnail to Facebook if not already uploaded
          const thumbnailUrl = thumbnailAsset.url.startsWith('http')
            ? thumbnailAsset.url
            : `${PUBLIC_BASE_URL}${thumbnailAsset.url}`;
          thumbnailImageHash = await facebookApi.uploadAdImage(adAccountId, thumbnailUrl);
          // Save hash to thumbnail asset
          thumbnailAsset.metadata = thumbnailAsset.metadata || {};
          thumbnailAsset.metadata.facebookImageHash = thumbnailImageHash;
          await thumbnailAsset.save();
        } else {
          // Fall back to any image asset in the adset
          const fallbackImage = await Asset.findOne({
            adsetId: adset._id,
            type: 'image',
          });

          if (fallbackImage?.metadata?.facebookImageHash) {
            thumbnailImageHash = fallbackImage.metadata.facebookImageHash;
          } else if (fallbackImage?.url) {
            const imageUrl = fallbackImage.url.startsWith('http')
              ? fallbackImage.url
              : `${PUBLIC_BASE_URL}${fallbackImage.url}`;
            thumbnailImageHash = await facebookApi.uploadAdImage(adAccountId, imageUrl);
            // Save hash to image asset
            fallbackImage.metadata = fallbackImage.metadata || {};
            fallbackImage.metadata.facebookImageHash = thumbnailImageHash;
            await fallbackImage.save();
          }
        }
      } catch (error: any) {
        console.warn('Failed to get video thumbnail image:', error.message);
        // Continue without thumbnail - Facebook might generate one automatically
      }

      const videoData: any = {
        video_id: videoId || '',
        message: adBody,
        title: headline?.content || '',
        link_description: description?.content || '',
        call_to_action: {
          type: ctaType,
          value: {
            link: landingPageUrl,
          },
        },
      };

      // Add thumbnail if we have one (required by Facebook)
      if (thumbnailImageHash) {
        videoData.image_hash = thumbnailImageHash;
      }

      creativeSpec = {
        objectStorySpec: {
          page_id: pageId,
          video_data: videoData,
        },
        pageId: pageId,
      };
    } else {
      // Handle image asset for preview
      let imageHash = asset.metadata?.facebookImageHash;
      
      if (!imageHash && asset.url) {
        try {
          const imageUrl = asset.url.startsWith('http') 
            ? asset.url 
            : `${PUBLIC_BASE_URL}${asset.url}`;
          imageHash = await facebookApi.uploadAdImage(adAccountId, imageUrl);
        } catch (error: any) {
          console.error('Failed to upload image for preview:', error);
          // Continue without hash - preview might still work
        }
      }

      creativeSpec = {
        objectStorySpec: {
          page_id: pageId,
          link_data: {
            image_hash: imageHash || '',
            link: landingPageUrl,
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
    }

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
        ctaType: combination.ctaType || 'LEARN_MORE',
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

    // Get account filter - query by accountId first, then fallback to userId
    const accountFilter = await getAccountFilter(req);
    
    const query: any = { _id: adsetId };
    
    if (accountFilter.accountId) {
      query.accountId = new mongoose.Types.ObjectId(accountFilter.accountId);
    } else {
      // Fallback to userId for backward compatibility
      query.userId = new mongoose.Types.ObjectId(accountFilter.userId);
    }

    const adset = await Adset.findOne(query);

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

    // Do not allow editing of combinations that have already been deployed
    if (combination.deployedToFacebook) {
      res.status(400).json({ error: 'Cannot edit a combination that has been deployed to Facebook' });
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

    // Get account filter - query by accountId first, then fallback to userId
    const accountFilter = await getAccountFilter(req);
    
    const query: any = { _id: adsetId };
    
    if (accountFilter.accountId) {
      query.accountId = new mongoose.Types.ObjectId(accountFilter.accountId);
    } else {
      // Fallback to userId for backward compatibility
      query.userId = new mongoose.Types.ObjectId(accountFilter.userId);
    }

    const adset = await Adset.findOne(query);

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

    // Prevent deletion of combinations that have already been deployed
    if (combination.deployedToFacebook) {
      res.status(400).json({ error: 'Cannot delete a combination that has been deployed to Facebook' });
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

    // Get account filter - query by accountId first, then fallback to userId
    const accountFilter = await getAccountFilter(req);
    
    const query: any = { _id: adsetId };
    
    if (accountFilter.accountId) {
      query.accountId = new mongoose.Types.ObjectId(accountFilter.accountId);
    } else {
      // Fallback to userId for backward compatibility
      query.userId = new mongoose.Types.ObjectId(accountFilter.userId);
    }

    const adset = await Adset.findOne(query);

    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    // Only delete combinations that are not deployed
    const result = await AdCombination.deleteMany({
      _id: { $in: combinationIds },
      adsetId,
      deployedToFacebook: { $ne: true },
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


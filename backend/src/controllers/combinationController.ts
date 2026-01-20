import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Adset } from '../models/Adset';
import { Asset } from '../models/Asset';
import { AdCopy } from '../models/AdCopy';
import { AdCombination } from '../models/AdCombination';
import { ScoringService } from '../services/ai/ScoringService';

// Lazy initialization - only create when needed
const getScoringService = () => new ScoringService();

export const generateCombinations = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { adsetId } = req.params;

    const adset = await Adset.findOne({
      _id: adsetId,
      userId: req.userId,
    });

    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    // Fetch all components
    const assets = await Asset.find({ adsetId });
    const headlines = await AdCopy.find({ adsetId, type: 'headline' });
    const bodies = await AdCopy.find({ adsetId, type: 'body' });
    const descriptions = await AdCopy.find({ adsetId, type: 'description' });
    const ctas = await AdCopy.find({ adsetId, type: 'cta' });

    if (
      assets.length === 0 ||
      headlines.length === 0 ||
      bodies.length === 0 ||
      descriptions.length === 0 ||
      ctas.length === 0
    ) {
      res.status(400).json({
        error: 'Missing required components. Need at least one asset, headline, body, description, and CTA.',
      });
      return;
    }

    // Generate all combinations
    const combinations = [];
    let variantIndex = 0;

    for (const asset of assets) {
      for (const headline of headlines) {
        for (const body of bodies) {
          for (const description of descriptions) {
            for (const cta of ctas) {
              // Score the combination
              const scoringService = getScoringService();
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
                bodyId: body._id,
                descriptionId: description._id,
                ctaId: cta._id,
                scores: scoring.scores,
                overallScore: scoring.overallScore,
                predictedCTR: scoring.predictedCTR,
                deployedToFacebook: false,
              });

              await combination.save();
              combinations.push(combination);
              variantIndex++;
            }
          }
        }
      }
    }

    res.json({
      totalCombinations: combinations.length,
      combinations: combinations.slice(0, 100), // Return first 100
    });
  } catch (error: any) {
    console.error('Generate combinations error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate combinations' });
  }
};

export const getCombinations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { adsetId } = req.params;
    const { sortBy = 'overallScore', limit = 100 } = req.query;

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

    const combinations = await AdCombination.find({ adsetId })
      .populate('assetIds')
      .populate('headlineId')
      .populate('bodyId')
      .populate('descriptionId')
      .populate('ctaId')
      .sort(sortOptions)
      .limit(parseInt(limit as string));

    res.json(combinations);
  } catch (error: any) {
    console.error('Get combinations error:', error);
    res.status(500).json({ error: 'Failed to fetch combinations' });
  }
};


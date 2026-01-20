import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AdCopy } from '../models/AdCopy';
import { Adset } from '../models/Adset';

export const getAdCopies = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const copies = await AdCopy.find({ adsetId }).sort({ type: 1, variantIndex: 1 });

    res.json(copies);
  } catch (error: any) {
    console.error('Get ad copies error:', error);
    res.status(500).json({ error: 'Failed to fetch ad copies' });
  }
};

export const createAdCopy = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { adsetId, type, content, variantIndex } = req.body;

    if (!adsetId || !type || !content) {
      res.status(400).json({ error: 'Missing required fields' });
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

    // Auto-calculate variantIndex if not provided
    let finalVariantIndex = variantIndex;
    if (finalVariantIndex === undefined) {
      const existingCopies = await AdCopy.find({ adsetId, type });
      finalVariantIndex = existingCopies.length;
    }

    const copy = new AdCopy({
      adsetId,
      type,
      content,
      variantIndex: finalVariantIndex,
      generatedByAI: false,
    });

    await copy.save();

    res.status(201).json(copy);
  } catch (error: any) {
    console.error('Create ad copy error:', error);
    res.status(500).json({ error: error.message || 'Failed to create ad copy' });
  }
};

export const updateAdCopy = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    const copy = await AdCopy.findById(id).populate('adsetId');

    if (!copy) {
      res.status(404).json({ error: 'Ad copy not found' });
      return;
    }

    const adset = copy.adsetId as any;
    if (adset.userId.toString() !== req.userId) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    copy.content = content;
    await copy.save();

    res.json(copy);
  } catch (error: any) {
    console.error('Update ad copy error:', error);
    res.status(500).json({ error: error.message || 'Failed to update ad copy' });
  }
};

export const deleteAdCopy = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const copy = await AdCopy.findById(id).populate('adsetId');

    if (!copy) {
      res.status(404).json({ error: 'Ad copy not found' });
      return;
    }

    const adset = copy.adsetId as any;
    if (adset.userId.toString() !== req.userId) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    await AdCopy.findByIdAndDelete(id);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete ad copy error:', error);
    res.status(500).json({ error: 'Failed to delete ad copy' });
  }
};


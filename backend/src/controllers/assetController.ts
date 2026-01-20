import { Response } from 'express';
import multer from 'multer';
import path from 'path';
import { AuthRequest } from '../middleware/auth';
import { Asset } from '../models/Asset';
import { Adset } from '../models/Adset';
import { FileStorageService } from '../services/storage/FileStorageService';
// @ts-ignore - image-size doesn't have TypeScript types
import sizeOf from 'image-size';

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and videos are allowed.'));
    }
  },
});

const fileStorageService = new FileStorageService();

export const uploadAssets = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { adsetId } = req.body;

    if (!adsetId) {
      res.status(400).json({ error: 'Adset ID is required' });
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

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const savedAssets = [];

    for (const file of files) {
      const isImage = file.mimetype.startsWith('image/');
      const isVideo = file.mimetype.startsWith('video/');

      if (!isImage && !isVideo) {
        continue;
      }

      const { filename, filepath, url } = await fileStorageService.saveFile(
        file,
        adsetId.toString()
      );

      let metadata: any = {
        size: file.size,
        mimeType: file.mimetype,
      };

      if (isImage) {
        try {
          const dimensions = sizeOf(file.buffer);
          metadata.width = dimensions.width;
          metadata.height = dimensions.height;
        } catch (error) {
          console.error('Failed to get image dimensions:', error);
        }
      }

      const asset = new Asset({
        adsetId,
        type: isImage ? 'image' : 'video',
        filename,
        filepath,
        url,
        metadata,
      });

      await asset.save();
      savedAssets.push(asset);
    }

    res.status(201).json(savedAssets);
  } catch (error: any) {
    console.error('Upload assets error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload assets' });
  }
};

export const getAssets = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const assets = await Asset.find({ adsetId }).sort({ createdAt: -1 });

    res.json(assets);
  } catch (error: any) {
    console.error('Get assets error:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
};

export const deleteAsset = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const asset = await Asset.findById(id).populate('adsetId');

    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    const adset = asset.adsetId as any;
    if (adset.userId.toString() !== req.userId) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    await fileStorageService.deleteFile(asset.filepath);
    await Asset.findByIdAndDelete(id);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete asset error:', error);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
};

export { upload };


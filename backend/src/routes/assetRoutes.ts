import { Router } from 'express';
import {
  uploadAssets,
  getAssets,
  deleteAsset,
  upload,
} from '../controllers/assetController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post(
  '/upload',
  authenticate,
  upload.array('files', 20),
  uploadAssets
);
router.get('/:adsetId', authenticate, getAssets);
router.delete('/:id', authenticate, deleteAsset);

export default router;


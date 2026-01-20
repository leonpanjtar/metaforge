import { Router } from 'express';
import {
  createAdset,
  getAdsets,
  getAdset,
  updateAdset,
  deleteAdset,
  duplicateAdset,
  syncAdsetFromFacebook,
} from '../controllers/adsetController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/', authenticate, createAdset);
router.post('/:id/duplicate', authenticate, duplicateAdset);
router.post('/:id/sync', authenticate, syncAdsetFromFacebook);
router.get('/', authenticate, getAdsets);
router.get('/:id', authenticate, getAdset);
router.put('/:id', authenticate, updateAdset);
router.delete('/:id', authenticate, deleteAdset);

export default router;


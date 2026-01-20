import { Router } from 'express';
import {
  getAdCopies,
  createAdCopy,
  updateAdCopy,
  deleteAdCopy,
} from '../controllers/adCopyController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/:adsetId', authenticate, getAdCopies);
router.post('/', authenticate, createAdCopy);
router.put('/:id', authenticate, updateAdCopy);
router.delete('/:id', authenticate, deleteAdCopy);

export default router;


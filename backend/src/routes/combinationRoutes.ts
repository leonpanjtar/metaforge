import { Router } from 'express';
import {
  generateCombinations,
  getCombinations,
  previewCombination,
} from '../controllers/combinationController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/generate/:adsetId', authenticate, generateCombinations);
router.get('/:adsetId', authenticate, getCombinations);
router.get('/preview/:adsetId/:combinationId', authenticate, previewCombination);

export default router;


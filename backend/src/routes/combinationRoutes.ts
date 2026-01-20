import { Router } from 'express';
import {
  generateCombinations,
  scoreCombinations,
  getCombinations,
  previewCombination,
  updateCombination,
  deleteCombination,
  deleteCombinationsBulk,
} from '../controllers/combinationController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/generate/:adsetId', authenticate, generateCombinations);
router.post('/score/:adsetId', authenticate, scoreCombinations);
router.get('/:adsetId', authenticate, getCombinations);
router.get('/preview/:adsetId/:combinationId', authenticate, previewCombination);
router.put('/:adsetId/:combinationId', authenticate, updateCombination);
router.delete('/:adsetId/:combinationId', authenticate, deleteCombination);
router.post('/bulk-delete/:adsetId', authenticate, deleteCombinationsBulk);

export default router;


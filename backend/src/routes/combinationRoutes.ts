import { Router } from 'express';
import {
  generateCombinations,
  getCombinations,
} from '../controllers/combinationController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/generate/:adsetId', authenticate, generateCombinations);
router.get('/:adsetId', authenticate, getCombinations);

export default router;


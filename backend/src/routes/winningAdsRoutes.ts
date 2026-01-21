import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getWinningAds } from '../controllers/winningAdsController';

const router = Router();

// GET /api/winning-ads?since=YYYY-MM-DD&until=YYYY-MM-DD
router.get('/', authenticate, getWinningAds);

export default router;



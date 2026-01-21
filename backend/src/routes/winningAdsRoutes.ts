import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getWinningAds, getAdDetails, importWinningAd } from '../controllers/winningAdsController';

const router = Router();

// GET /api/winning-ads?since=YYYY-MM-DD&until=YYYY-MM-DD
router.get('/', authenticate, getWinningAds);

// GET /api/winning-ads/:facebookAdId/details
router.get('/:facebookAdId/details', authenticate, getAdDetails);

// POST /api/winning-ads/import
router.post('/import', authenticate, importWinningAd);

export default router;



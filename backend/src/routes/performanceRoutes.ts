import { Router } from 'express';
import {
  syncPerformanceData,
  getPerformanceData,
} from '../controllers/performanceController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/sync/:adsetId', authenticate, syncPerformanceData);
router.get('/:adsetId', authenticate, getPerformanceData);

export default router;


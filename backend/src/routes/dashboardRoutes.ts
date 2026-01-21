import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getDashboardStats, getFacebookConnectionStatus } from '../controllers/dashboardController';

const router = Router();

router.get('/stats', authenticate, getDashboardStats);
router.get('/facebook-status', authenticate, getFacebookConnectionStatus);

export default router;


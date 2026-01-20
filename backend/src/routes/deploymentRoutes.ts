import { Router } from 'express';
import { deployAds } from '../controllers/deploymentController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/deploy', authenticate, deployAds);

export default router;


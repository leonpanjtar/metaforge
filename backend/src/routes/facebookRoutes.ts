import { Router } from 'express';
import {
  getAuthUrl,
  handleCallback,
  getAccounts,
  getCampaigns,
  disconnectAccount,
  importFacebookAdsets,
} from '../controllers/facebookController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/auth-url', authenticate, getAuthUrl);
router.get('/callback', handleCallback); // No auth required - user comes from Facebook
router.get('/accounts', authenticate, getAccounts);
router.get('/campaigns/:accountId', authenticate, getCampaigns);
router.post('/campaigns/:campaignId/import-adsets', authenticate, importFacebookAdsets);
router.post('/disconnect/:accountId', authenticate, disconnectAccount);

export default router;


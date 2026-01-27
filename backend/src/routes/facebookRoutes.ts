import { Router } from 'express';
import {
  getAuthUrl,
  handleCallback,
  getAccounts,
  getCampaigns,
  syncCampaigns,
  disconnectAccount,
  importFacebookAdsets,
  getPagesForCampaign,
  getActiveAccount,
  setActiveAccount,
  getAccountsForSelection,
} from '../controllers/facebookController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/auth-url', authenticate, getAuthUrl);
router.get('/callback', handleCallback); // No auth required - user comes from Facebook
router.get('/accounts', authenticate, getAccounts);
router.get('/accounts/selection', authenticate, getAccountsForSelection);
router.get('/active', authenticate, getActiveAccount);
router.post('/active', authenticate, setActiveAccount);
router.get('/campaigns/:accountId', authenticate, getCampaigns);
router.post('/campaigns/:accountId/sync', authenticate, syncCampaigns);
router.post('/campaigns/:campaignId/import-adsets', authenticate, importFacebookAdsets);
router.get('/pages/:campaignId', authenticate, getPagesForCampaign);
router.post('/disconnect/:accountId', authenticate, disconnectAccount);

export default router;


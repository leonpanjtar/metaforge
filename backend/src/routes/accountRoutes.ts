import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getAccounts,
  createAccount,
  addUserToAccount,
  getAccountMembers,
  removeUserFromAccount,
  updateUserRole,
  inviteUserToAccount,
  getAccountInvitations,
  cancelInvitation,
  acceptInvitation,
  completeInvitationAcceptance,
  updateUserProfile,
} from '../controllers/accountController';

const router = Router();

router.get('/', authenticate, getAccounts);
router.post('/', authenticate, createAccount);
router.post('/:accountId/members', authenticate, addUserToAccount);
router.get('/:accountId/members', authenticate, getAccountMembers);
router.delete('/:accountId/members/:userId', authenticate, removeUserFromAccount);
router.put('/:accountId/members/:userId/role', authenticate, updateUserRole);

// Invitation routes
router.post('/:accountId/invitations', authenticate, inviteUserToAccount);
router.get('/:accountId/invitations', authenticate, getAccountInvitations);
router.delete('/:accountId/invitations/:invitationId', authenticate, cancelInvitation);
// Public invitation routes (no auth required)
router.post('/invitations/accept', (req, res, next) => {
  acceptInvitation(req, res).catch(next);
});
router.post('/invitations/complete', authenticate, completeInvitationAcceptance);

// User profile routes
router.put('/users/:userId', authenticate, updateUserProfile);

export default router;


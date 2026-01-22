import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { UserAccount } from '../models/UserAccount';

/**
 * Get account filter for queries
 * If accountId is provided in request, verify membership and return account filter
 * Otherwise, return userId filter (backward compatibility)
 */
export const getAccountFilter = async (req: AuthRequest): Promise<{ userId: string; accountId?: string }> => {
  const accountId = req.headers['x-account-id'] as string;
  
  if (accountId && req.userId) {
    // Verify user is a member of this account
    const membership = await UserAccount.findOne({
      userId: req.userId,
      accountId: accountId,
    });

    if (!membership) {
      throw new Error('Access denied. You are not a member of this account.');
    }

    return { userId: req.userId, accountId };
  }

  // Fallback to userId only (backward compatibility)
  return { userId: req.userId! };
};

/**
 * Get all user IDs that belong to the current account
 * Returns array of user IDs if accountId is provided, otherwise returns [userId]
 */
export const getAccountUserIds = async (req: AuthRequest): Promise<string[]> => {
  const accountId = req.headers['x-account-id'] as string;
  
  if (accountId && req.userId) {
    try {
      // Verify user is a member of this account
      const membership = await UserAccount.findOne({
        userId: req.userId,
        accountId: accountId,
      });

      if (!membership) {
        console.warn(`[getAccountUserIds] User ${req.userId} is not a member of account ${accountId}, falling back to userId only`);
        return [req.userId!];
      }

      // Get all user IDs in this account
      const memberships = await UserAccount.find({ accountId });
      const userIds = memberships.map(m => m.userId.toString());
      return userIds;
    } catch (error: any) {
      console.warn(`[getAccountUserIds] Error getting account user IDs, falling back to userId only:`, error.message);
      return [req.userId!];
    }
  }

  // Fallback to current user only (backward compatibility)
  return [req.userId!];
};

/**
 * Get all user IDs as ObjectIds that belong to the current account
 * This is a convenience function that converts string IDs to ObjectIds
 */
export const getAccountUserObjectIds = async (req: AuthRequest): Promise<mongoose.Types.ObjectId[]> => {
  const userIds = await getAccountUserIds(req);
  return userIds.map(id => new mongoose.Types.ObjectId(id));
};


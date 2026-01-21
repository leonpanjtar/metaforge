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


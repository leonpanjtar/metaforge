import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { UserAccount } from '../models/UserAccount';

/**
 * Middleware to validate and set account context
 * Expects accountId in header: X-Account-Id
 * Validates that the user is a member of the account
 */
export const accountContext = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const accountId = req.headers['x-account-id'] as string;

    if (!accountId) {
      res.status(400).json({ error: 'Account ID required. Please select an account.' });
      return;
    }

    // Verify user is a member of this account
    const membership = await UserAccount.findOne({
      userId: req.userId,
      accountId: accountId,
    });

    if (!membership) {
      res.status(403).json({ error: 'Access denied. You are not a member of this account.' });
      return;
    }

    req.accountId = accountId;
    next();
  } catch (error) {
    console.error('Account context error:', error);
    res.status(500).json({ error: 'Failed to validate account context' });
  }
};


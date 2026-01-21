import { AuthRequest } from '../middleware/auth';
import { UserSettings } from '../models/UserSettings';
import { FacebookAccount } from '../models/FacebookAccount';

/**
 * Get the active Facebook account for the current user
 * Returns null if no active account is set
 */
export async function getActiveFacebookAccount(req: AuthRequest): Promise<any | null> {
  try {
    const settings = await UserSettings.findOne({ userId: req.userId });
    
    if (!settings || !settings.activeFacebookAccountId) {
      return null;
    }

    const account = await FacebookAccount.findOne({
      _id: settings.activeFacebookAccountId,
      userId: req.userId,
      isActive: true,
    });

    return account;
  } catch (error: any) {
    console.error('[getActiveFacebookAccount] Error:', error);
    return null;
  }
}

/**
 * Get active account ID for filtering queries
 */
export async function getActiveAccountId(req: AuthRequest): Promise<string | null> {
  const account = await getActiveFacebookAccount(req);
  return account?._id?.toString() || null;
}


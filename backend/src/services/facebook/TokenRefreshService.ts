import { FacebookAccount } from '../../models/FacebookAccount';
import { FacebookApiService } from './FacebookApiService';

export class TokenRefreshService {
  /**
   * Check if token is expired or expiring soon (within 7 days)
   */
  static isTokenExpiringSoon(expiryDate?: Date): boolean {
    if (!expiryDate) return true; // If no expiry date, assume it needs refresh
    
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    return expiryDate <= sevenDaysFromNow;
  }

  /**
   * Refresh a long-lived token using the existing token
   * Note: Facebook long-lived tokens can be extended if they're still valid
   */
  static async refreshToken(account: any): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    try {
      // Use the existing token to get a new long-lived token
      const apiService = new FacebookApiService(account.accessToken);
      const appId = process.env.FACEBOOK_APP_ID;
      const appSecret = process.env.FACEBOOK_APP_SECRET;
      
      const response = await fetch(
        `https://graph.facebook.com/v24.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${account.accessToken}`
      );
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message);
      }
      
      return {
        accessToken: data.access_token,
        expiresIn: data.expires_in || 5184000, // 60 days in seconds
      };
    } catch (error: any) {
      throw new Error(`Failed to refresh token: ${error.message}`);
    }
  }

  /**
   * Check and refresh token if needed
   */
  static async checkAndRefreshToken(account: any): Promise<boolean> {
    if (this.isTokenExpiringSoon(account.tokenExpiry)) {
      try {
        const tokenResult = await this.refreshToken(account);
        
        // Update token and expiry
        const tokenExpiry = new Date();
        tokenExpiry.setSeconds(tokenExpiry.getSeconds() + tokenResult.expiresIn);
        
        account.accessToken = tokenResult.accessToken;
        account.tokenExpiry = tokenExpiry;
        await account.save();
        
        return true;
      } catch (error: any) {
        console.error(`Failed to refresh token for account ${account.accountId}:`, error);
        // Token might be invalid - mark as inactive
        account.isActive = false;
        await account.save();
        return false;
      }
    }
    return true; // Token is still valid
  }
}


# Facebook App Setup Guide

This guide will help you configure your Facebook App for localhost development.

## Step 1: Create/Select Facebook App

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click **My Apps** → **Create App** (or select existing app)
3. Choose **Business** as the app type
4. Fill in app details and create

## Step 2: Configure Basic Settings

1. In your app dashboard, go to **Settings** → **Basic**
2. Note your **App ID** and **App Secret** (you'll need these for `.env`)
3. **Important:** You do NOT need to add `localhost` to App Domains (Facebook doesn't allow it)
4. Click **Add Platform** → Select **Website**
5. In **Site URL**, enter:
   ```
   http://localhost:3001
   ```
6. Save changes

**Note:** For localhost development, you only need to configure the OAuth Redirect URIs in Step 3. App Domains is not required for localhost.

## Step 3: Configure Facebook Login

1. Go to **Products** in the left sidebar
2. Find **Facebook Login** and click **Set Up** (if not already added)
3. Go to **Facebook Login** → **Settings**
4. Under **Valid OAuth Redirect URIs**, add:
   ```
   http://localhost:3001/api/facebook/callback
   ```
5. Save changes

## Step 4: Configure Permissions

1. Go to **Facebook Login** → **Settings** → **Advanced**
2. Under **Deauthorize Callback URL**, you can add:
   ```
   http://localhost:3001/api/facebook/deauthorize
   ```
   (Optional, for handling user disconnections)

## Step 5: Add Required Permissions

1. Go to **App Review** → **Permissions and Features**
2. Request the following permissions (for Development Mode, these are usually auto-approved):
   - `ads_management` - Manage ads
   - `ads_read` - Read ads data

**Note:** In Development Mode, you can use these permissions without app review. For production, you'll need to submit for review.

## Step 6: Update Your .env File

Add these values to your `backend/.env`:

```env
FACEBOOK_APP_ID=your-app-id-here
FACEBOOK_APP_SECRET=your-app-secret-here
FACEBOOK_REDIRECT_URI=http://localhost:3001/api/facebook/callback
```

## Troubleshooting

### "Can't load URL: The domain of this URL isn't included in the app's domains"

**Solution:**
- **For localhost:** You don't need to add anything to App Domains. Just configure the OAuth Redirect URI.
- Ensure the redirect URI exactly matches what's in **Valid OAuth Redirect URIs**
- Check that your `.env` file has the correct `FACEBOOK_REDIRECT_URI`
- Make sure your app is in **Development Mode** (localhost only works in dev mode)

### "Invalid OAuth redirect_uri"

**Solution:**
- The redirect URI in your code must exactly match what's configured in Facebook
- Check for trailing slashes, http vs https, port numbers
- Make sure it's added to **Valid OAuth Redirect URIs** in Facebook Login settings

### "App Not Setup: This app is still in development mode"

**Solution:**
- This is normal for localhost development
- Only users added as **Test Users** or **Developers/Admins** can use the app
- To add test users: **Roles** → **Test Users** → **Add Test Users**

## Production Deployment

When deploying to production:

1. Change app mode from **Development** to **Live**
2. Update **App Domains** to your production domain
3. Update **Site URL** to your production URL
4. Update **Valid OAuth Redirect URIs** to production callback URL
5. Submit required permissions for App Review
6. Update `.env` with production URLs

## Quick Checklist

- [ ] App created in Facebook Developers
- [ ] App ID and App Secret copied
- [ ] Website platform added with `http://localhost:3001` (App Domains not needed for localhost)
- [ ] Facebook Login product added
- [ ] Redirect URI added: `http://localhost:3001/api/facebook/callback`
- [ ] Permissions `ads_management` and `ads_read` available
- [ ] `.env` file configured with correct values
- [ ] Backend server restarted after `.env` changes


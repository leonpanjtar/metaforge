# Setup Instructions

## Prerequisites

- Node.js 18+ installed
- MongoDB 6+ running locally or connection string
- OpenAI API key
- Facebook App credentials (App ID, App Secret)

## Facebook App Configuration

To use Facebook OAuth with localhost, you need to configure your Facebook App settings:

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Select your app (or create a new one)
3. Go to **Settings** → **Basic**
4. **Note:** You do NOT need to add `localhost` to App Domains (Facebook doesn't allow it)
5. Scroll down to **Add Platform** → Select **Website**
6. In **Site URL**, add:
   - `http://localhost:3001`
7. Go to **Products** → **Facebook Login** → **Settings**
8. Add to **Valid OAuth Redirect URIs**:
   - `http://localhost:3001/api/facebook/callback`
9. Save all changes

**Important Notes:**
- For localhost development, you only need to configure the OAuth Redirect URI (not App Domains)
- Make sure your app is in **Development Mode** (not Live)
- The redirect URI in your `.env` must exactly match what you configure in Facebook
- App Domains field is only required for production domains (like `example.com`)
- Go to FB Business settings -> Apps and add Ad Accounts to App assets

## Installation

### Backend

```bash
cd backend
npm install
```

Create `.env` file:
```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/facebook-ads-manager
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
OPENAI_API_KEY=your-openai-api-key
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_REDIRECT_URI=http://localhost:3001/api/facebook/callback
NODE_ENV=development
```

Start backend:
```bash
npm run dev
```

### Frontend

```bash
cd frontend
npm install
```

Create `.env` file:
```env
VITE_API_URL=http://localhost:3001
VITE_FACEBOOK_APP_ID=your-facebook-app-id
```

Start frontend:
```bash
npm run dev
```

## Features Implemented

✅ User authentication (register/login)
✅ Facebook OAuth integration
✅ Campaign and adset management
✅ Asset upload (images/videos)
✅ Landing page scraping
✅ AI copy generation (OpenAI GPT-4)
✅ AI image generation (DALL-E)
✅ Combination generator
✅ AI scoring system
✅ Ad deployment to Facebook
✅ Performance tracking
✅ Daily performance sync job

## Usage Flow

1. Register/Login
2. Connect Facebook account
3. Select ad account and view campaigns
4. Create adset with targeting
5. Upload assets or scrape landing page
6. Generate AI copy variants
7. Generate combinations
8. Review scores and select ads
9. Deploy to Facebook
10. Monitor performance dashboard

## Notes

- Performance sync job runs daily at 2 AM
- File uploads stored locally in `backend/uploads/`
- All Facebook API calls use v18.0
- OpenAI GPT-4 used for copy generation
- DALL-E 3 used for image generation

## Facebook Links

https://developers.facebook.com/docs/marketing-api/creative/generative-ai-features/

https://developers.facebook.com/docs/marketing-api/reference/ad-account/adimages/#Creating

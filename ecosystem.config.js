module.exports = {
  apps: [
    {
      name: 'facebook-backend',
      cwd: './backend',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'development',
        PORT: process.env.PORT || 3001,
        MONGODB_URI: process.env.MONGODB_URI,
        JWT_SECRET: process.env.JWT_SECRET,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID,
        FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET,
        FACEBOOK_REDIRECT_URI: process.env.FACEBOOK_REDIRECT_URI,
        PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
      },
    },
    {
      name: 'facebook-frontend',
      cwd: './frontend',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'development',
        VITE_API_URL: process.env.VITE_API_URL,
        VITE_FACEBOOK_APP_ID: process.env.VITE_FACEBOOK_APP_ID,
      },
    },
  ],
};



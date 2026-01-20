# Facebook Ads Scale Manager

A comprehensive Facebook Ads management application that enables performance marketers to create, optimize, and deploy ads at scale using AI-powered asset generation and predictive scoring.

## Features

- Facebook Marketing API integration with OAuth 2.0
- Adset creation with advanced targeting options
- AI-powered copy generation and creative optimization
- Combination generator for ad variants
- Predictive ad scoring system
- Performance tracking and AI-powered insights

## Tech Stack

- **Frontend**: React 18+ with TypeScript, Tailwind CSS, React Query
- **Backend**: Node.js with Express, TypeScript
- **Database**: MongoDB with Mongoose
- **AI Services**: OpenAI API (GPT-4, DALL-E)
- **Facebook Integration**: Meta Marketing API v18+

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB 6+
- OpenAI API key
- Facebook App credentials

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

3. Set up environment variables:
   - Copy `backend/.env.example` to `backend/.env`
   - Copy `frontend/.env.example` to `frontend/.env`
   - Fill in your credentials

4. Start MongoDB

5. Start the backend:
   ```bash
   cd backend && npm run dev
   ```

6. Start the frontend:
   ```bash
   cd frontend && npm run dev
   ```

## Project Structure

```
facebook/
├── frontend/          # React frontend application
├── backend/           # Express backend API
├── shared/            # Shared types/interfaces
└── README.md
```

## License

MIT


import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { connectDatabase } from './utils/database';
import authRoutes from './routes/authRoutes';
import facebookRoutes from './routes/facebookRoutes';
import adsetRoutes from './routes/adsetRoutes';
import assetRoutes from './routes/assetRoutes';
import aiRoutes from './routes/aiRoutes';
import adCopyRoutes from './routes/adCopyRoutes';
import combinationRoutes from './routes/combinationRoutes';
import deploymentRoutes from './routes/deploymentRoutes';
import performanceRoutes from './routes/performanceRoutes';
import winningAdsRoutes from './routes/winningAdsRoutes';
import { startPerformanceSyncJob } from './jobs/performanceSyncJob';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/facebook', facebookRoutes);
app.use('/api/adsets', adsetRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ad-copies', adCopyRoutes);
app.use('/api/combinations', combinationRoutes);
app.use('/api/deployment', deploymentRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/winning-ads', winningAdsRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const startServer = async () => {
  try {
    await connectDatabase();
    
    // Start performance sync job
    startPerformanceSyncJob();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

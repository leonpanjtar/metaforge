import mongoose, { Document, Schema } from 'mongoose';

export interface IWinningAdsCache extends Document {
  userId: mongoose.Types.ObjectId;
  facebookAccountId: mongoose.Types.ObjectId;
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
  ads: Array<{
    combinationId: string;
    facebookAdId: string;
    adsetId: string;
    campaignName: string;
    adsetName: string;
    adName: string;
    impressions: number;
    clicks: number;
    spend: number;
    schedules: number;
    costPerSchedule: number;
    conversionRate: number;
    score: number;
    url: string;
    facebookAdLink: string;
    conversionEvents: Array<{
      actionType: string;
      value: number;
    }>;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const WinningAdsCacheSchema = new Schema<IWinningAdsCache>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    facebookAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'FacebookAccount',
      required: true,
    },
    since: {
      type: String,
      required: true,
    },
    until: {
      type: String,
      required: true,
    },
    ads: {
      type: [
        {
          combinationId: String,
          facebookAdId: String,
          adsetId: String,
          campaignName: String,
          adsetName: String,
          adName: String,
          impressions: Number,
          clicks: Number,
          spend: Number,
          schedules: Number,
          costPerSchedule: Number,
          conversionRate: Number,
          score: Number,
          url: String,
          facebookAdLink: String,
          conversionEvents: [
            {
              actionType: String,
              value: Number,
            },
          ],
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast lookups
WinningAdsCacheSchema.index({ userId: 1, facebookAccountId: 1, since: 1, until: 1 }, { unique: true });

export const WinningAdsCache = mongoose.model<IWinningAdsCache>(
  'WinningAdsCache',
  WinningAdsCacheSchema
);


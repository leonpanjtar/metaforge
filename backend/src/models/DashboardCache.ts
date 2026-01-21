import mongoose, { Document, Schema } from 'mongoose';

export interface IDashboardCache extends Document {
  userId: mongoose.Types.ObjectId;
  facebookAccountId: mongoose.Types.ObjectId;
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
  totalLeads: number;
  totalSpend: number;
  averageCostPerLead: number;
  averageConversionRate: number;
  dailyStats: Array<{
    date: string;
    leads: number;
    spend: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const DashboardCacheSchema = new Schema<IDashboardCache>(
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
    totalLeads: {
      type: Number,
      default: 0,
    },
    totalSpend: {
      type: Number,
      default: 0,
    },
    averageCostPerLead: {
      type: Number,
      default: 0,
    },
    averageConversionRate: {
      type: Number,
      default: 0,
    },
    dailyStats: {
      type: [
        {
          date: String,
          leads: Number,
          spend: Number,
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
DashboardCacheSchema.index({ userId: 1, facebookAccountId: 1, since: 1, until: 1 }, { unique: true });

export const DashboardCache = mongoose.model<IDashboardCache>('DashboardCache', DashboardCacheSchema);


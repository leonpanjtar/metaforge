import mongoose, { Document, Schema } from 'mongoose';

export interface IPerformanceData extends Document {
  adCombinationId: mongoose.Types.ObjectId;
  date: Date;
  impressions: number;
  clicks: number;
  ctr: number;
  spend: number;
  leads?: number;
  conversions?: number;
  frequency?: number;
  createdAt: Date;
  updatedAt: Date;
}

const PerformanceDataSchema = new Schema<IPerformanceData>(
  {
    adCombinationId: {
      type: Schema.Types.ObjectId,
      ref: 'AdCombination',
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    impressions: {
      type: Number,
      default: 0,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    ctr: {
      type: Number,
      default: 0,
    },
    spend: {
      type: Number,
      default: 0,
    },
    leads: {
      type: Number,
    },
    conversions: {
      type: Number,
    },
    frequency: {
      type: Number,
    },
  },
  {
    timestamps: true,
  }
);

PerformanceDataSchema.index({ adCombinationId: 1, date: 1 }, { unique: true });

export const PerformanceData = mongoose.model<IPerformanceData>(
  'PerformanceData',
  PerformanceDataSchema
);


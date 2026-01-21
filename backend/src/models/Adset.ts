import mongoose, { Document, Schema } from 'mongoose';

export interface ITargeting {
  ageMin?: number;
  ageMax?: number;
  genders?: number[];
  locations?: string[];
  interests?: string[];
  behaviors?: string[];
  detailedTargeting?: string[];
  placements?: string[];
}

export interface IAdset extends Document {
  userId: mongoose.Types.ObjectId;
  accountId?: mongoose.Types.ObjectId; // Optional for backward compatibility
  campaignId: mongoose.Types.ObjectId;
  facebookAdsetId?: string;
  name: string;
  targeting: ITargeting;
  budget: number;
  schedule?: {
    startTime?: Date;
    endTime?: Date;
  };
  status: string;
  // Facebook adset settings
  optimizationGoal?: string;
  billingEvent?: string;
  bidStrategy?: string;
  bidAmount?: number;
  promotedObject?: {
    pixelId?: string;
    customEventType?: string;
    objectStoreUrl?: string;
    productSetId?: string;
    [key: string]: any;
  };
  attributionSpec?: any[];
  conversionSpecs?: any[];
  dailyBudget?: number;
  lifetimeBudget?: number;
  budgetRemaining?: number;
  endTime?: string;
  startTime?: string;
  contentData?: {
    landingPageUrl?: string;
    angle?: string;
    keywords?: string[];
    importantThings?: string;
    baseAssets?: mongoose.Types.ObjectId[];
    facebookPageId?: string;
    facebookPageName?: string;
  };
  createdByApp?: boolean; // True if created through the app, false/undefined if imported from Facebook
  createdAt: Date;
  updatedAt: Date;
}

const TargetingSchema = new Schema<ITargeting>({
  ageMin: Number,
  ageMax: Number,
  genders: [Number],
  locations: [String],
  interests: [String],
  behaviors: [String],
  detailedTargeting: [String],
  placements: [String],
});

const AdsetSchema = new Schema<IAdset>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: false,
    },
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
    },
    facebookAdsetId: {
      type: String,
    },
    name: {
      type: String,
      required: true,
    },
    targeting: {
      type: TargetingSchema,
      required: true,
    },
    budget: {
      type: Number,
      required: true,
    },
    schedule: {
      startTime: Date,
      endTime: Date,
    },
    status: {
      type: String,
      default: 'PAUSED',
    },
    // Facebook adset settings
    optimizationGoal: String,
    billingEvent: String,
    bidStrategy: String,
    bidAmount: Number,
    promotedObject: Schema.Types.Mixed,
    attributionSpec: [Schema.Types.Mixed],
    conversionSpecs: [Schema.Types.Mixed],
    dailyBudget: Number,
    lifetimeBudget: Number,
    budgetRemaining: Number,
    endTime: String,
    startTime: String,
    contentData: {
      landingPageUrl: { type: String, default: '' },
      angle: { type: String, default: '' },
      keywords: { type: [String], default: [] },
      importantThings: { type: String, default: '' },
      baseAssets: [{ type: Schema.Types.ObjectId, ref: 'Asset' }],
    facebookPageId: { type: String, default: '' },
    facebookPageName: { type: String, default: '' },
    },
    createdByApp: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    minimize: false, // Don't remove empty objects
  }
);

AdsetSchema.index({ userId: 1 });
AdsetSchema.index({ campaignId: 1 });

export const Adset = mongoose.model<IAdset>('Adset', AdsetSchema);


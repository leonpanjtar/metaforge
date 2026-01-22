import mongoose, { Document, Schema } from 'mongoose';

export interface IScores {
  alignment: number;
  fit: number;
  clarity: number;
  match: number;
}

export interface IAdCombination extends Document {
  adsetId: mongoose.Types.ObjectId;
  assetIds: mongoose.Types.ObjectId[];
  headlineId: mongoose.Types.ObjectId;
  bodyId: mongoose.Types.ObjectId;
  descriptionId: mongoose.Types.ObjectId;
  ctaType?: string; // Facebook CTA button type (e.g., 'LEARN_MORE', 'SHOP_NOW', etc.)
  url?: string; // Landing page URL
  scores: IScores;
  overallScore: number;
  predictedCTR?: number;
  deployedToFacebook: boolean;
  facebookAdId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ScoresSchema = new Schema<IScores>({
  alignment: { type: Number, default: 0 },
  fit: { type: Number, default: 0 },
  clarity: { type: Number, default: 0 },
  match: { type: Number, default: 0 },
});

const AdCombinationSchema = new Schema<IAdCombination>(
  {
    adsetId: {
      type: Schema.Types.ObjectId,
      ref: 'Adset',
      required: true,
    },
    assetIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Asset',
      },
    ],
    headlineId: {
      type: Schema.Types.ObjectId,
      ref: 'AdCopy',
      required: true,
    },
    bodyId: {
      type: Schema.Types.ObjectId,
      ref: 'AdCopy',
      required: true,
    },
    descriptionId: {
      type: Schema.Types.ObjectId,
      ref: 'AdCopy',
      required: true,
    },
    url: {
      type: String,
    },
    ctaType: {
      type: String,
    },
    scores: {
      type: ScoresSchema,
      default: () => ({
        alignment: 0,
        fit: 0,
        clarity: 0,
        match: 0,
      }),
    },
    overallScore: {
      type: Number,
      default: 0,
    },
    predictedCTR: {
      type: Number,
    },
    deployedToFacebook: {
      type: Boolean,
      default: false,
    },
    facebookAdId: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

AdCombinationSchema.index({ adsetId: 1 });
AdCombinationSchema.index({ overallScore: -1 });

export const AdCombination = mongoose.model<IAdCombination>(
  'AdCombination',
  AdCombinationSchema
);


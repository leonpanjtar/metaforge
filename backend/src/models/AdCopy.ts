import mongoose, { Document, Schema } from 'mongoose';

export interface IAdCopy extends Document {
  adsetId: mongoose.Types.ObjectId;
  type: 'headline' | 'body' | 'description' | 'cta' | 'hook';
  content: string;
  variantIndex: number;
  generatedByAI: boolean;
  aiPrompt?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdCopySchema = new Schema<IAdCopy>(
  {
    adsetId: {
      type: Schema.Types.ObjectId,
      ref: 'Adset',
      required: true,
    },
    type: {
      type: String,
      enum: ['headline', 'body', 'description', 'cta', 'hook'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    variantIndex: {
      type: Number,
      required: true,
    },
    generatedByAI: {
      type: Boolean,
      default: false,
    },
    aiPrompt: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

AdCopySchema.index({ adsetId: 1, type: 1, variantIndex: 1 });

export const AdCopy = mongoose.model<IAdCopy>('AdCopy', AdCopySchema);


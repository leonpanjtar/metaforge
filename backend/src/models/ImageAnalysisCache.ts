import mongoose, { Document, Schema } from 'mongoose';
import crypto from 'crypto';

export interface IImageAnalysisCache extends Document {
  imageHash: string; // SHA-256 hash of image buffer
  analysis: {
    description: string;
    aspectRatio: string;
    dimensions: { width: number; height: number };
    style: string;
    mainSubject: string;
    colors: string[];
    textElements: any[];
    composition?: string;
    background?: string;
    preserveElements?: any[];
    changeableElements?: any[];
    coreConcept?: string;
    currentStyle?: string;
    currentColors?: string[];
    currentBackground?: string;
  };
  userInstructions?: string; // Cache key includes user instructions
  createdAt: Date;
  updatedAt: Date;
}

const ImageAnalysisCacheSchema = new Schema<IImageAnalysisCache>(
  {
    imageHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    analysis: {
      type: {
        description: String,
        aspectRatio: String,
        dimensions: {
          width: Number,
          height: Number,
        },
        style: String,
        mainSubject: String,
        colors: [String],
        textElements: Schema.Types.Mixed,
        composition: String,
        background: String,
        preserveElements: Schema.Types.Mixed,
        changeableElements: Schema.Types.Mixed,
        coreConcept: String,
        currentStyle: String,
        currentColors: [String],
        currentBackground: String,
      },
      required: true,
    },
    userInstructions: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Index for fast lookups
ImageAnalysisCacheSchema.index({ imageHash: 1, userInstructions: 1 }, { unique: true });

// Helper function to generate image hash
export function generateImageHash(imageBuffer: Buffer, userInstructions?: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(imageBuffer);
  if (userInstructions) {
    hash.update(userInstructions);
  }
  return hash.digest('hex');
}

export const ImageAnalysisCache = mongoose.model<IImageAnalysisCache>(
  'ImageAnalysisCache',
  ImageAnalysisCacheSchema
);

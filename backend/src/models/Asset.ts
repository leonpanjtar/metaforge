import mongoose, { Document, Schema } from 'mongoose';

export interface IAssetMetadata {
  width?: number;
  height?: number;
  size?: number;
  duration?: number;
  mimeType?: string;
  facebookImageHash?: string;
}

export interface IAsset extends Document {
  adsetId: mongoose.Types.ObjectId;
  type: 'image' | 'video';
  filename: string;
  filepath: string;
  url: string;
  metadata?: IAssetMetadata;
  createdAt: Date;
  updatedAt: Date;
}

const AssetMetadataSchema = new Schema<IAssetMetadata>({
  width: Number,
  height: Number,
  size: Number,
  duration: Number,
  mimeType: String,
});

const AssetSchema = new Schema<IAsset>(
  {
    adsetId: {
      type: Schema.Types.ObjectId,
      ref: 'Adset',
      required: true,
    },
    type: {
      type: String,
      enum: ['image', 'video'],
      required: true,
    },
    filename: {
      type: String,
      required: true,
    },
    filepath: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    metadata: {
      type: AssetMetadataSchema,
    },
  },
  {
    timestamps: true,
  }
);

AssetSchema.index({ adsetId: 1 });

export const Asset = mongoose.model<IAsset>('Asset', AssetSchema);


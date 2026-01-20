import mongoose, { Document, Schema } from 'mongoose';

export interface ICampaign extends Document {
  userId: mongoose.Types.ObjectId;
  facebookAccountId: mongoose.Types.ObjectId;
  facebookCampaignId: string;
  name: string;
  objective: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const CampaignSchema = new Schema<ICampaign>(
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
    facebookCampaignId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    objective: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

CampaignSchema.index({ userId: 1, facebookCampaignId: 1 }, { unique: true });

export const Campaign = mongoose.model<ICampaign>('Campaign', CampaignSchema);


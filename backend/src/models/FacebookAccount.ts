import mongoose, { Document, Schema } from 'mongoose';

export interface IFacebookAccount extends Document {
  userId: mongoose.Types.ObjectId;
  accountId: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiry?: Date;
  accountName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FacebookAccountSchema = new Schema<IFacebookAccount>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    accountId: {
      type: String,
      required: true,
    },
    accessToken: {
      type: String,
      required: true,
    },
    refreshToken: {
      type: String,
    },
    tokenExpiry: {
      type: Date,
    },
    accountName: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

FacebookAccountSchema.index({ userId: 1, accountId: 1 }, { unique: true });

export const FacebookAccount = mongoose.model<IFacebookAccount>(
  'FacebookAccount',
  FacebookAccountSchema
);


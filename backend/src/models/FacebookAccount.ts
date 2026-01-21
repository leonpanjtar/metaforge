import mongoose, { Document, Schema } from 'mongoose';

export interface IFacebookAccount extends Document {
  userId: mongoose.Types.ObjectId;
  accountId: string; // Facebook ad account ID
  organizationAccountId?: mongoose.Types.ObjectId; // Organization account ID (for sharing)
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
    organizationAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: false, // Optional for backward compatibility
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


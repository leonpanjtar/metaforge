import mongoose, { Document, Schema } from 'mongoose';

export interface IAccount extends Document {
  name: string;
  ownerId: mongoose.Types.ObjectId; // User who created the account
  createdAt: Date;
  updatedAt: Date;
}

const AccountSchema = new Schema<IAccount>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Account = mongoose.model<IAccount>('Account', AccountSchema);


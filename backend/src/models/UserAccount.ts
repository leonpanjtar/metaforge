import mongoose, { Document, Schema } from 'mongoose';

export interface IUserAccount extends Document {
  userId: mongoose.Types.ObjectId;
  accountId: mongoose.Types.ObjectId;
  role: 'owner' | 'admin' | 'member'; // owner can't be changed, admin can manage users, member is read-only
  createdAt: Date;
  updatedAt: Date;
}

const UserAccountSchema = new Schema<IUserAccount>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member'],
      default: 'member',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index to prevent duplicate memberships
UserAccountSchema.index({ userId: 1, accountId: 1 }, { unique: true });

export const UserAccount = mongoose.model<IUserAccount>('UserAccount', UserAccountSchema);


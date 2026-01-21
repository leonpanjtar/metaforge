import mongoose, { Document, Schema } from 'mongoose';
import crypto from 'crypto';

export interface IInvitation extends Document {
  accountId: mongoose.Types.ObjectId;
  email: string;
  role: 'admin' | 'member';
  token: string; // Unique token for accepting invitation
  invitedBy: mongoose.Types.ObjectId; // User who sent the invitation
  status: 'pending' | 'accepted' | 'expired';
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InvitationSchema = new Schema<IInvitation>(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member',
      required: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'expired'],
      default: 'pending',
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    },
  },
  {
    timestamps: true,
  }
);

// Generate unique token before saving
InvitationSchema.pre('save', function (next) {
  if (!this.token) {
    this.token = crypto.randomBytes(32).toString('hex');
  }
  next();
});

// Index for faster lookups
InvitationSchema.index({ email: 1, accountId: 1 });
InvitationSchema.index({ token: 1 });
InvitationSchema.index({ status: 1, expiresAt: 1 });

export const Invitation = mongoose.model<IInvitation>('Invitation', InvitationSchema);


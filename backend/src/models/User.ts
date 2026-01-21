import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  email: string;
  passwordHash?: string;
  name?: string;
  requiresPasswordSetup?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: false, // Can be set later for invitation-based accounts
    },
    requiresPasswordSetup: {
      type: Boolean,
      default: false,
    },
    name: {
      type: String,
      required: false, // Can be set during password setup
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.model<IUser>('User', UserSchema);


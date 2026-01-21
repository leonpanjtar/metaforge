import mongoose, { Document, Schema } from 'mongoose';

export interface IUserSettings extends Document {
  userId: mongoose.Types.ObjectId;
  activeFacebookAccountId?: mongoose.Types.ObjectId;
  activeFacebookPageId?: string;
  activeFacebookPageName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSettingsSchema = new Schema<IUserSettings>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    activeFacebookAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'FacebookAccount',
    },
    activeFacebookPageId: {
      type: String,
    },
    activeFacebookPageName: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const UserSettings = mongoose.model<IUserSettings>('UserSettings', UserSettingsSchema);


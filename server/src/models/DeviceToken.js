// A phone's Expo push token, linked to the passenger logged in on it.
// One record per token (unique): registering the same token again - or
// after another person logs in on that phone - updates the record instead of
// adding a duplicate, so a phone only ever gets ONE person's notifications.
// Push tokens only allow sending notifications to the app; they are not
// login credentials. Deleted on logout and when Expo reports them invalid.
import mongoose from 'mongoose';

const { Schema } = mongoose;

const deviceTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['ios', 'android'], required: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const DeviceToken = mongoose.model('DeviceToken', deviceTokenSchema);

// An in-app notification for ONE passenger (services/notification.service.js
// creates them when something real happens - never from a client request).
// Texts never contain other passengers' names, phone numbers or emails.
//
// dedupeKey makes each event notify a user once, even if the code that
// creates it runs twice (a retried request, two servers).
import mongoose from 'mongoose';

const { Schema } = mongoose;

export const NOTIFICATION_TYPES = [
  'compatible_traveller', // a new verified traveller is compatible with your trip
  'pool_created', // a compatible shared ride was started for your flight
  'pool_joined', // someone joined your shared ride
  'pool_left', // someone left your shared ride
  'booking_confirmed',
  'booking_cancelled',
  'booking_updated', // e.g. the passenger left their shared ride
  'system', // account / service messages
];

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 120 },
    message: { type: String, required: true, maxlength: 300 },
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', default: null },
    poolId: { type: Schema.Types.ObjectId, ref: 'Pool', default: null },
    bookingReference: { type: String, default: null },
    readAt: { type: Date, default: null },
    dedupeKey: { type: String, required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id.toString();
        if (ret.tripId) ret.tripId = ret.tripId.toString();
        if (ret.poolId) ret.poolId = ret.poolId.toString();
        ret.read = Boolean(ret.readAt);
        delete ret._id;
        delete ret.__v;
        delete ret.userId;
        delete ret.dedupeKey;
        return ret;
      },
    },
  },
);

// The list (newest first), the unread count, one notification per event per user
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });
notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });

export const Notification = mongoose.model('Notification', notificationSchema);

// A passenger's payment for ONE booking (services/payment.service.js).
//
// The amount is always worked out by the server from FlyPool's pricing rules
// (never sent by the app). Each passenger in a shared ride pays their own
// share with their own Payment - one payment can never count for someone
// else (userId + tripId + bookingReference).
//
// status
//   pending     created, waiting for the passenger to pay
//   processing  the provider reported the payment as authorised, not captured
//   paid        captured (demo: simulated), confirmed by the server
//   failed      the payment attempt failed - a new attempt can be started
//   cancelled   abandoned by the passenger, or the booking was cancelled /
//               ended before it was paid - nothing was charged
// There is no "refunded": no refunds are processed (needsRefund marks a
// payment captured for a booking that was no longer active).
//
// activeKey = bookingReference while a payment is pending, processing or
// paid (unique), so a booking can't have two open payments or be paid twice.
//
// mode "demo": a simulated payment - no money moves. Kept on every record.
// Card / UPI / bank details never reach FlyPool's server.
import mongoose from 'mongoose';

const { Schema } = mongoose;

export const PAYMENT_STATUSES = ['pending', 'processing', 'paid', 'failed', 'cancelled'];

const paymentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    bookingReference: { type: String, required: true },
    poolId: { type: String, default: null },
    rideMode: { type: String, enum: ['shared', 'solo'], required: true },
    vehicleType: { type: String, enum: ['sedan', 'suv'], required: true },

    mode: { type: String, enum: ['demo'], required: true },
    provider: { type: String, enum: ['demo'], required: true },
    providerOrderId: { type: String, required: true, unique: true },
    providerPaymentId: { type: String, default: null },

    amount: { type: Number, required: true, min: 0 }, // whole rupees
    currency: { type: String, default: 'INR' },
    // How the amount came about: the cab's total, who shares it, this share
    fare: { type: Schema.Types.Mixed, required: true },

    status: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
    activeKey: { type: String, default: null },
    paidAt: { type: Date },
    failureReason: { type: String, default: null },
    needsRefund: { type: Boolean, default: false },
    statusHistory: [
      {
        _id: false,
        status: { type: String, enum: PAYMENT_STATUSES },
        at: { type: Date, default: Date.now },
        source: String, // created | demo | webhook | booking_cancelled | ...
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id.toString();
        ret.tripId = ret.tripId.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.userId;
        delete ret.activeKey;
        return ret;
      },
    },
  },
);

// One open-or-paid payment per booking
paymentSchema.index({ activeKey: 1 }, { unique: true, partialFilterExpression: { activeKey: { $type: 'string' } } });
// History lists
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ tripId: 1, bookingReference: 1 });

export const Payment = mongoose.model('Payment', paymentSchema);

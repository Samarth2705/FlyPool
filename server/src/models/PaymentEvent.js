// Payment provider webhook events already handled, by the provider's event
// id (unique) - a repeated delivery or a replayed event is recognised and
// ignored instead of being applied twice.
import mongoose from 'mongoose';

const { Schema } = mongoose;

const paymentEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    providerOrderId: { type: String, default: null },
    result: { type: String, default: null }, // what was done: applied | ignored:<why>
  },
  { timestamps: true },
);

export const PaymentEvent = mongoose.model('PaymentEvent', paymentEventSchema);

// Payments and fare splitting.
//
// WHAT IS REAL AND WHAT IS NOT
// - No payment provider is connected (no credentials). PAYMENT_MODE=demo
//   runs SIMULATED payments: the passenger chooses "success" / "failure" /
//   "cancel" in a clearly labelled demo checkout, and no money moves. Every
//   record says mode "demo". PAYMENT_MODE=off turns payments off.
// - The webhook endpoint (POST /api/payments/webhook) already follows the
//   Razorpay webhook format and signature (HMAC-SHA256 of the raw body with
//   PAYMENT_WEBHOOK_SECRET, header X-Razorpay-Signature, event id header
//   X-Razorpay-Event-Id). Connecting Razorpay for real still needs order
//   creation through its API and its checkout in the app (see the report).
//
// AMOUNTS - always from the server's pricing rules (fare.service.js), never
// from the app:
// - Solo: the whole cab's estimate for the passenger's group.
// - Shared: the cab's estimate for everyone in the shared ride, split
//   equally per person (each group pays its people's shares). Payment opens
//   once EVERY member of the shared ride has a confirmed booking, so the
//   split is final for those passengers; their shares add up to the total.
// - If someone later leaves or cancels, the fare is re-estimated for those
//   who remain. Amounts already paid don't change; the pool summary shows the
//   difference (collected vs. current total). Top-ups and refunds are not
//   supported yet - nothing is ever shown as refunded.
//
// SAFETY
// - One open-or-paid payment per booking (unique activeKey): starting again
//   returns the open one; a paid booking can't be paid again.
// - A payment belongs to one user's booking; another user gets 404.
// - Cancelling a booking or leaving a shared ride cancels its unfinished
//   payments in the same transaction (ride.service.js); paid ones are kept.
// - Webhooks: signature checked (timing-safe), each event id applied once,
//   amount and currency must match, and a status never goes backwards.
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { vehicleByType } from '../config/pricing.js';
import { Payment } from '../models/Payment.js';
import { PaymentEvent } from '../models/PaymentEvent.js';
import { Pool } from '../models/Pool.js';
import { Trip } from '../models/Trip.js';
import { AppError } from '../utils/AppError.js';
import { describeMember, describeTrip, estimateForMembers } from './matching.service.js';

const OPEN = ['pending', 'processing'];

function requireEnabled() {
  if (env.paymentMode === 'off') {
    throw new AppError(503, 'PAYMENTS_UNAVAILABLE', 'Payments aren’t available in FlyPool yet.');
  }
}

async function loadOwnTrip(tripId, userId) {
  if (!mongoose.isValidObjectId(tripId)) throw new AppError(404, 'TRIP_NOT_FOUND', 'Trip not found.');
  const trip = await Trip.findOne({ _id: tripId, userId });
  if (!trip) throw new AppError(404, 'TRIP_NOT_FOUND', 'Trip not found.');
  return trip;
}

const blocked = (code, message) => ({ blocker: { code, message } });

// What this trip's passenger owes now - or why they can't pay.
// -> { amount, fare: { total, people, partySize, share, perPerson, breakdown }, pool? } | { blocker }
async function amountDue(trip) {
  const booking = trip.booking;
  if (trip.status === 'cancelled' || !booking) return blocked('NO_ACTIVE_BOOKING', 'This trip has no confirmed booking to pay for.');
  if (booking.status !== 'confirmed') return blocked('NO_ACTIVE_BOOKING', 'This trip has no confirmed booking to pay for.');
  const vehicle = vehicleByType(booking.vehicleType);
  const me = describeTrip(trip);

  if (booking.mode === 'solo') {
    const estimate = estimateForMembers(vehicle, [me]);
    if (!estimate) return blocked('FARE_UNAVAILABLE', 'There is no fare estimate for this drop-off area, so it can’t be paid in the app yet.');
    return {
      amount: estimate.total,
      fare: { total: estimate.total, people: estimate.people, partySize: me.partySize, share: estimate.total, perPerson: estimate.perPerson, breakdown: estimate.breakdown },
    };
  }

  // Shared: everyone in the ride must have booked, then split among them
  const pool = trip.poolId ? await Pool.findById(trip.poolId) : null;
  if (!pool || pool.status === 'cancelled') return blocked('POOL_UNAVAILABLE', 'Your shared ride is no longer available.');
  const memberTrips = await Trip.find({ _id: { $in: pool.members.map((m) => m.tripId) } }).select('booking status');
  const bookedIds = new Set(memberTrips.filter((t) => t.status !== 'cancelled' && t.booking?.status === 'confirmed').map((t) => String(t._id)));
  const notBooked = pool.members.filter((m) => !bookedIds.has(String(m.tripId))).length;
  const members = pool.members.map((m) => describeMember(m, pool));
  const estimate = estimateForMembers(vehicle, members);
  const poolInfo = { pool, memberTrips };
  if (notBooked > 0) {
    return {
      ...blocked(
        'WAITING_FOR_BOOKINGS',
        `Payment opens once everyone in your shared ride has booked - waiting for ${notBooked === 1 ? '1 traveller' : `${notBooked} travellers`}.`,
      ),
      ...poolInfo,
      estimate,
    };
  }
  if (!estimate) return { ...blocked('FARE_UNAVAILABLE', 'There is no fare estimate for this shared ride, so it can’t be paid in the app yet.'), ...poolInfo };
  const share = estimate.shares[String(trip._id)];
  return {
    amount: share,
    fare: { total: estimate.total, people: estimate.people, partySize: me.partySize, share, perPerson: estimate.perPerson, breakdown: estimate.breakdown },
    ...poolInfo,
    estimate,
  };
}

// Who in the shared ride has paid - "You" or the other booking's area and
// group size, their share and paid / not paid. No names, no payment details.
async function poolSummary(trip, due) {
  if (!due.pool) return null;
  const { pool, memberTrips } = due;
  const referenceOf = new Map(memberTrips.map((t) => [String(t._id), t.booking?.status === 'confirmed' ? t.booking.reference : null]));
  const paid = await Payment.find({ tripId: { $in: pool.members.map((m) => m.tripId) }, status: 'paid' }).select('tripId bookingReference amount');
  const paidFor = new Map(paid.filter((p) => referenceOf.get(String(p.tripId)) === p.bookingReference).map((p) => [String(p.tripId), p.amount]));
  const total = due.estimate?.total ?? null;
  let other = 0;
  const members = pool.members.map((m) => {
    const isYou = String(m.tripId) === String(trip._id);
    if (!isYou) other += 1;
    return {
      label: isYou ? 'You' : `Traveller ${other}`,
      isYou,
      area: m.destinationArea ?? null,
      partySize: m.partySize,
      booked: Boolean(referenceOf.get(String(m.tripId))),
      share: due.estimate?.shares[String(m.tripId)] ?? null,
      paid: paidFor.has(String(m.tripId)),
    };
  });
  const collected = [...paidFor.values()].reduce((sum, a) => sum + a, 0);
  return {
    vehicleType: pool.vehicleType,
    total,
    collected,
    outstanding: total == null ? null : Math.max(0, total - collected),
    overCollected: total == null ? 0 : Math.max(0, collected - total),
    allPaid: members.every((m) => m.paid),
    members,
  };
}

// GET /api/trips/:tripId/payment
export async function getPaymentView(tripId, userId) {
  const trip = await loadOwnTrip(tripId, userId);
  const due = await amountDue(trip);
  const history = await Payment.find({ tripId: trip._id, userId }).sort({ createdAt: -1 });
  const reference = trip.booking?.reference;
  const current = reference ? (history.find((p) => p.bookingReference === reference && (OPEN.includes(p.status) || p.status === 'paid')) ?? null) : null;
  const latest = reference ? (history.find((p) => p.bookingReference === reference) ?? null) : null;
  return {
    mode: env.paymentMode,
    demo: env.paymentMode === 'demo',
    trip,
    booking: trip.booking,
    amount: due.amount ?? null,
    fare: due.fare ?? null,
    blocker: due.blocker ?? null,
    payment: current ?? latest,
    canPay: env.paymentMode !== 'off' && !due.blocker && current?.status !== 'paid',
    pool: await poolSummary(trip, due),
    history,
  };
}

// POST /api/trips/:tripId/payment - start (or continue) paying for the booking.
// Returns { payment, created }. The amount comes from amountDue(), never the app.
export async function startPayment(tripId, userId) {
  requireEnabled();
  const trip = await loadOwnTrip(tripId, userId);
  const due = await amountDue(trip);
  if (due.blocker) throw new AppError(409, due.blocker.code, due.blocker.message);
  const reference = trip.booking.reference;

  const active = await Payment.findOne({ activeKey: reference });
  if (active?.status === 'paid') throw new AppError(409, 'ALREADY_PAID', 'This booking is already paid.');
  if (active && active.amount === due.amount) return { payment: active, created: false };
  if (active) {
    // The amount changed since it was started (the shared ride changed): replace it
    await closePayment(active._id, 'cancelled', 'amount_changed');
  }

  try {
    const payment = await Payment.create({
      userId,
      tripId: trip._id,
      bookingReference: reference,
      poolId: trip.booking.poolId ?? null,
      rideMode: trip.booking.mode,
      vehicleType: trip.booking.vehicleType,
      mode: 'demo',
      provider: 'demo',
      providerOrderId: `demo_order_${crypto.randomBytes(9).toString('hex')}`,
      amount: due.amount,
      currency: 'INR',
      fare: due.fare,
      status: 'pending',
      activeKey: reference,
      statusHistory: [{ status: 'pending', source: 'created' }],
    });
    return { payment, created: true };
  } catch (error) {
    // Two "start" requests at once: the other one created it
    if (error.code === 11000) {
      const existing = await Payment.findOne({ activeKey: reference });
      if (existing) return { payment: existing, created: false };
    }
    throw error;
  }
}

// Move an OPEN payment to a final / new status (atomic: never backwards,
// never twice). Returns the updated payment, or null if it wasn't open.
async function closePayment(paymentId, status, source, extra = {}) {
  const set = { status, ...extra };
  if (status === 'paid') set.paidAt = new Date();
  if (status === 'failed' || status === 'cancelled') set.activeKey = null;
  if (status === 'failed' || status === 'cancelled') set.failureReason = extra.failureReason ?? source;
  return Payment.findOneAndUpdate(
    { _id: paymentId, status: { $in: OPEN } },
    { $set: set, $push: { statusHistory: { status, at: new Date(), source } } },
    { new: true },
  );
}

// Is the booking this payment is for still the trip's active booking?
async function bookingStillActive(payment) {
  const trip = await Trip.findById(payment.tripId).select('status booking');
  return Boolean(trip && trip.status !== 'cancelled' && trip.booking?.status === 'confirmed' && trip.booking.reference === payment.bookingReference);
}

// POST /api/payments/:paymentId/demo-result { outcome } - DEMO MODE ONLY.
// The passenger's choice in the demo checkout; no money moves.
export async function completeDemoPayment(paymentId, userId, outcome) {
  if (env.paymentMode !== 'demo') throw new AppError(404, 'NOT_FOUND', 'Not found.');
  if (!mongoose.isValidObjectId(paymentId)) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
  const payment = await Payment.findOne({ _id: paymentId, userId });
  if (!payment || payment.provider !== 'demo') throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
  if (!OPEN.includes(payment.status)) return { payment, changed: false }; // already decided: same answer again

  if (outcome === 'success') {
    if (!(await bookingStillActive(payment))) {
      await closePayment(payment._id, 'cancelled', 'booking_not_active');
      throw new AppError(409, 'BOOKING_NOT_ACTIVE', 'This booking was cancelled or changed, so it can’t be paid. Nothing was charged.');
    }
    const trip = await Trip.findById(payment.tripId);
    const due = await amountDue(trip);
    if (due.blocker || due.amount !== payment.amount) {
      await closePayment(payment._id, 'cancelled', 'amount_changed');
      throw new AppError(409, 'AMOUNT_CHANGED', 'Your share changed because the shared ride changed. Nothing was charged - please start the payment again.');
    }
  }

  const status = outcome === 'success' ? 'paid' : outcome === 'failure' ? 'failed' : 'cancelled';
  const extra = outcome === 'success' ? { providerPaymentId: `demo_pay_${crypto.randomBytes(9).toString('hex')}` } : {};
  if (outcome === 'failure') extra.failureReason = 'Demo: payment declined';
  const updated = await closePayment(payment._id, status, 'demo', extra);
  return { payment: updated ?? (await Payment.findById(payment._id)), changed: Boolean(updated) };
}

// GET /api/payments - the passenger's own payments, newest first
export async function listMyPayments(userId) {
  const payments = await Payment.find({ userId }).sort({ createdAt: -1 }).limit(100);
  const trips = await Trip.find({ _id: { $in: payments.map((p) => p.tripId) } }).select('destination travelDate expectedArrivalTime flight');
  const tripOf = new Map(trips.map((t) => [String(t._id), t]));
  return payments.map((p) => {
    const t = tripOf.get(String(p.tripId));
    return {
      ...p.toJSON(),
      trip: t ? { id: String(t._id), destination: t.destination, travelDate: t.travelDate, flightNumber: t.flight?.flightNumber ?? null } : null,
    };
  });
}

// ---- provider webhooks -----------------------------------------------------------------

const MAP = { 'payment.captured': 'paid', 'order.paid': 'paid', 'payment.authorized': 'processing', 'payment.failed': 'failed' };

function signatureMatches(rawBody, signature, secret) {
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature.toLowerCase(), 'hex'));
}

// POST /api/payments/webhook (raw body). Returns { result }.
export async function handleWebhook(rawBody, headers) {
  const secret = env.paymentWebhookSecret;
  if (!secret) throw new AppError(503, 'WEBHOOKS_NOT_CONFIGURED', 'Payment webhooks are not configured.');
  if (!Buffer.isBuffer(rawBody) || !signatureMatches(rawBody, headers['x-razorpay-signature'], secret)) {
    throw new AppError(400, 'INVALID_SIGNATURE', 'Invalid webhook signature.');
  }
  const eventId = headers['x-razorpay-event-id'];
  if (typeof eventId !== 'string' || !eventId || eventId.length > 100) throw new AppError(400, 'INVALID_EVENT', 'Missing event id.');

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new AppError(400, 'INVALID_EVENT', 'Invalid event body.');
  }
  if (await PaymentEvent.exists({ eventId })) return { result: 'duplicate' };

  const type = String(body.event ?? '');
  const entity = body.payload?.payment?.entity ?? {};
  const orderId = typeof entity.order_id === 'string' ? entity.order_id : null;
  let result = 'ignored:unknown_event';
  const status = MAP[type];
  if (status && orderId) result = await applyProviderStatus(orderId, status, entity);

  try {
    await PaymentEvent.create({ eventId, type: type.slice(0, 60), providerOrderId: orderId, result });
  } catch (error) {
    if (error.code !== 11000) throw error; // the same event arrived twice at once: the other copy recorded it
    return { result: 'duplicate' };
  }
  return { result };
}

async function applyProviderStatus(orderId, status, entity) {
  const payment = await Payment.findOne({ providerOrderId: orderId });
  if (!payment) return 'ignored:unknown_order';
  // The amount (in paise) and currency must be exactly what this payment is for
  if (entity.amount !== payment.amount * 100 || String(entity.currency ?? '').toUpperCase() !== payment.currency) {
    return 'ignored:amount_mismatch';
  }
  const providerPaymentId = typeof entity.id === 'string' ? entity.id.slice(0, 60) : null;

  if (status === 'paid') {
    // Captured money is ALWAYS recorded. If the booking ended meanwhile, or
    // another payment is already active for it, it is flagged needsRefund
    // (FlyPool doesn't process refunds yet - nothing is shown as refunded).
    const otherActive = await Payment.exists({ activeKey: payment.bookingReference, _id: { $ne: payment._id } });
    const needsRefund = Boolean(otherActive) || !(await bookingStillActive(payment));
    const markPaid = (refund) =>
      Payment.findOneAndUpdate(
        { _id: payment._id, status: { $in: [...OPEN, 'failed', 'cancelled'] } },
        {
          $set: { status: 'paid', paidAt: new Date(), providerPaymentId, needsRefund: refund, activeKey: refund ? null : payment.bookingReference },
          $push: { statusHistory: { status: 'paid', at: new Date(), source: 'webhook' } },
        },
        { new: true },
      );
    let updated;
    try {
      updated = await markPaid(needsRefund);
    } catch (error) {
      if (error.code !== 11000) throw error;
      updated = await markPaid(true); // another payment became active at the same moment
    }
    return updated ? 'applied' : 'ignored:already_final';
  }
  if (status === 'processing') {
    const updated = await Payment.findOneAndUpdate(
      { _id: payment._id, status: 'pending' },
      { $set: { status: 'processing', providerPaymentId }, $push: { statusHistory: { status: 'processing', at: new Date(), source: 'webhook' } } },
      { new: true },
    );
    return updated ? 'applied' : 'ignored:not_pending';
  }
  const updated = await closePayment(payment._id, 'failed', 'webhook', {
    providerPaymentId,
    failureReason: typeof entity.error_description === 'string' ? entity.error_description.slice(0, 200) : 'Payment failed',
  });
  return updated ? 'applied' : 'ignored:already_final';
}

// ---- cancellations (called inside ride.service transactions) ------------------------

// The booking ended (cancelled / left the shared ride): its unfinished
// payments are cancelled - nothing was charged. Paid ones are kept as they are.
export async function cancelOpenPayments(tripId, bookingReference, source, session) {
  await Payment.updateMany(
    { tripId, bookingReference, status: { $in: OPEN } },
    {
      $set: { status: 'cancelled', activeKey: null, failureReason: source },
      $push: { statusHistory: { status: 'cancelled', at: new Date(), source } },
    },
    { session },
  );
}

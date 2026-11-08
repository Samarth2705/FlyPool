// Payment API calls. Server side: server/src/routes/payment.routes.js and
// services/payment.service.js. Only the logged-in passenger's own payments.
import api, { unwrap } from './client';

// DEMO MODE ONLY: the result chosen in the demo checkout - no money moves.
// outcome: 'success' | 'failure' | 'cancelled'  ->  { payment, changed }
// changed=false: the payment was already decided (same answer again).
export async function completeDemoPayment(paymentId, outcome) {
  return unwrap(await api.post(`/payments/${paymentId}/demo-result`, { outcome }));
}

// All of the passenger's payments, newest first:
// [{ id, bookingReference, amount, currency, status, mode, rideMode,
//    vehicleType, createdAt, paidAt, needsRefund, trip: { id, destination, travelDate, flightNumber } }]
export async function listMyPayments() {
  return unwrap(await api.get('/payments')).payments;
}

// Payments. Server side: server/src/services/payment.service.js
//
// DEMO ONLY: no payment provider is connected and no money moves. The
// browser never sends an amount or any card / UPI / bank details - the
// server works out each passenger's share from FlyPool's pricing rules and
// decides every status.
import api from './client';

// What the passenger owes for a trip's booking, the fare split and the status:
// { mode, demo, trip, booking, amount, fare, blocker, payment, canPay, pool, history }
export async function getPayment(tripId) {
  const res = await api.get(`/trips/${tripId}/payment`);
  return res.data.data;
}

// Start (or continue) paying - the server returns the payment already open
// for this booking instead of making a second one. -> { payment, created }
export async function startPayment(tripId) {
  const res = await api.post(`/trips/${tripId}/payment`, {});
  return res.data.data;
}

// DEMO MODE ONLY: the result chosen in the demo checkout.
// outcome: 'success' | 'failure' | 'cancelled'  ->  { payment, changed }
// changed=false: the payment was already decided (the same answer again).
export async function completeDemoPayment(paymentId, outcome) {
  const res = await api.post(`/payments/${paymentId}/demo-result`, { outcome });
  return res.data.data;
}

// All of the passenger's own payments, newest first
export async function listMyPayments() {
  const res = await api.get('/payments');
  return res.data.data.payments;
}

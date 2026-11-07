// Payments - see services/payment.service.js for what is real and what is demo.
import * as paymentService from '../services/payment.service.js';

// GET /api/trips/:tripId/payment - amount due, fare split, payment status
export async function getPaymentView(req, res) {
  res.json({ success: true, data: await paymentService.getPaymentView(req.params.tripId, req.userId) });
}

// POST /api/trips/:tripId/payment - start (or continue) paying.
// 201 a new payment, 200 the one already open for this booking.
export async function startPayment(req, res) {
  const { payment, created } = await paymentService.startPayment(req.params.tripId, req.userId);
  res.status(created ? 201 : 200).json({ success: true, data: { payment, created } });
}

// POST /api/payments/:paymentId/demo-result { outcome } - demo mode only
export async function completeDemoPayment(req, res) {
  const { payment, changed } = await paymentService.completeDemoPayment(req.params.paymentId, req.userId, req.body.outcome);
  res.json({ success: true, data: { payment, changed } });
}

// GET /api/payments - the passenger's payment history
export async function listMyPayments(req, res) {
  res.json({ success: true, data: { payments: await paymentService.listMyPayments(req.userId) } });
}

// POST /api/payments/webhook - signed provider events (raw body, no login)
export async function paymentWebhook(req, res) {
  const { result } = await paymentService.handleWebhook(req.body, req.headers);
  res.json({ success: true, data: { result } });
}

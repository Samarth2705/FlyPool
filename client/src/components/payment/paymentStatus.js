// Payment status labels, from the statuses the server really uses (pending,
// processing, paid, failed, cancelled - there is no "refunded").
// Every payment in FlyPool is a DEMO payment: no money moves.
export const PAYMENT_STATUS = {
  none: { label: 'Not paid yet', tone: 'neutral' },
  pending: { label: 'Payment pending', tone: 'warning' },
  processing: { label: 'Processing', tone: 'brand' },
  paid: { label: 'Paid (Demo)', tone: 'success' },
  failed: { label: 'Payment failed (Demo)', tone: 'error' },
  cancelled: { label: 'Payment cancelled', tone: 'neutral' },
};

export const statusOf = (payment) => PAYMENT_STATUS[payment?.status ?? 'none'] ?? PAYMENT_STATUS.none;

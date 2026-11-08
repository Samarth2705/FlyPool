// Payment status text and colours (the statuses the server really uses:
// pending, processing, paid, failed, cancelled - there is no "refunded").
export const PAYMENT_STATUS = {
  none: { label: 'Not paid yet', tone: 'neutral' },
  pending: { label: 'Waiting for payment', tone: 'warning' },
  processing: { label: 'Processing', tone: 'brand' },
  paid: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export function toneColors(tone, c) {
  return {
    neutral: [c.surfaceMuted, c.textSecondary],
    warning: [c.warningSurface, c.warningText],
    brand: [c.primarySoft, c.primarySoftText],
    success: [c.successSurface, c.successText],
    danger: [c.dangerSurface, c.dangerText],
  }[tone];
}

export const RIDE_LABELS = { shared: 'Pool', solo: 'Solo' };
export const VEHICLE_LABELS = { sedan: 'Sedan', suv: 'SUV' };

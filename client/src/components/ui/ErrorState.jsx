// Shown when a page couldn't load its data: the reason, a "Try again"
// button (when `onRetry` is given and retrying could help) and ways out.
// `children` adds page-specific links before My Trips / Plan a new trip.
import { useState } from 'react';
import Alert from './Alert';
import Button from './Button';
import Card from './Card';
import TripRecoveryLinks from './TripRecoveryLinks';

// Errors that trying again won't fix
const PERMANENT = ['TRIP_NOT_FOUND', 'TRIP_CANCELLED', 'FLIGHT_NOT_VERIFIED', 'VALIDATION_ERROR'];

export default function ErrorState({ error, title = 'We couldn’t load this page', onRetry, children }) {
  const [retrying, setRetrying] = useState(false);
  const canRetry = Boolean(onRetry) && !PERMANENT.includes(error?.code);

  async function handleRetry() {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <Card padding="lg" className="max-w-2xl">
      <Alert tone="error" title={title}>
        {error?.message}
      </Alert>
      <TripRecoveryLinks>
        {canRetry && (
          <Button
            variant="primary"
            size="sm"
            fullWidth={false}
            onClick={handleRetry}
            loading={retrying}
            loadingText="Trying again…"
          >
            Try again
          </Button>
        )}
        {children}
      </TripRecoveryLinks>
    </Card>
  );
}

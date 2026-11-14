// Ways out when a trip page can't continue (trip not found, cancelled, ...).
// `children` are shown first, e.g. a page-specific "Try again" button.
import { LinkButton } from './Button';

export default function TripRecoveryLinks({ children }) {
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {children}
      <LinkButton to="/trips" variant="secondary" size="sm">
        My Trips
      </LinkButton>
      <LinkButton to="/trip/new" variant="ghost" size="sm">
        Plan a new trip
      </LinkButton>
    </div>
  );
}

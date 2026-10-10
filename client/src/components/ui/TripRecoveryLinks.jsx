// Links shown when a trip page can't continue (trip not found, cancelled, ...)
import { Link } from 'react-router';

const link = 'text-sky-700 hover:underline dark:text-sky-400';

export default function TripRecoveryLinks({ children }) {
  return (
    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
      {children}
      <Link to="/trips" className={link}>
        My Trips
      </Link>
      <Link to="/trip/new" className={link}>
        Plan a new trip
      </Link>
    </div>
  );
}

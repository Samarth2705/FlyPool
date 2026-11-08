// Where a notification leads (the Notifications screen and push taps):
//   booking_confirmed / _cancelled / _updated -> Ride Management
//   pool_joined / pool_left                -> the trip's ride (who is in it)
//   compatible_traveller                   -> the trip's compatible travellers
//   system                                 -> nowhere (just marked read)
export function notificationHref({ type, tripId }) {
  if (!tripId) return null;
  const params = { tripId };
  switch (type) {
    case 'booking_confirmed':
    case 'booking_cancelled':
    case 'booking_updated':
      return { pathname: '/trip/[tripId]/manage', params };
    case 'pool_joined':
    case 'pool_left':
      return { pathname: '/trip/[tripId]/ride', params };
    case 'compatible_traveller':
      return { pathname: '/trip/[tripId]/matches', params };
    default:
      return null;
  }
}

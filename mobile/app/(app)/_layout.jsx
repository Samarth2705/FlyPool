// Logged-in screens (only reachable with a valid session - see app/_layout.jsx)
//   index                    Trip Planning: plan a new trip (home)          step 1
//   trip/[tripId]/details    Trip Planning for a saved trip (edit / view)    step 1
//   trip/[tripId]/verify     Flight Verification (ticket + flight details)   step 2
//   trip/[tripId]/matches    Find Travellers (compatible verified travellers) step 3
//   trip/[tripId]/ride       Ride Selection (pool / alone, Sedan / SUV)       step 4
//   trip/[tripId]/summary    Booking Summary + Confirm Booking                step 5
//   trip/[tripId]/booking    the confirmed booking (from the server)
//   trip/[tripId]/manage     Ride Management: status, history, cancel, leave pool
//   trip/[tripId]/payment    Payment: fare split, who has paid, pay (demo mode)
//   payments                 Payment history
//   notifications            Notifications (the header bell)
//   chat/[poolId]            Group chat of a shared ride (confirmed bookings)
//   trips                    My Trips
//   profile                  Profile
//   settings                 Settings (appearance, profile, app info, logout)
// Every screen shows AppHeader: logo (-> login, session kept), the page or
// the trip steps, and the profile picture (-> account menu).
import { Stack } from 'expo-router';
import { useTheme } from '../../src/theme';

export default function AppLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}

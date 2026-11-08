// One of the passenger's trips on My Trips: route, flight, arrival, trip
// status and verification status - all as the server saved them. Tapping it
// opens the trip (its details, from where the workflow continues).
import { Pressable, Text, View } from 'react-native';
import AppText from './AppText';
import FlightCode from './FlightCode';
import { router } from 'expo-router';
import { CalendarIcon, ChatIcon, ChevronRightIcon, MapPinIcon, PlaneIcon } from './icons';
import { formatDate, formatTime } from '../shared/dates';
import { formatFlightNumber } from '../shared/format';
import { rideTitle } from '../shared/rideOptions';
import { isDemoVerification, pickupLabel } from '../shared/trips';
import { borderWidth, fontWeight, makeStyles, radius, shadow, spacing, useTheme } from '../theme';

// Trip status -> label and tone
const STATUS = {
  awaiting_verification: { label: 'Needs verification', tone: 'warning' },
  flight_verified: { label: 'Flight verified', tone: 'success' },
  ride_selected: { label: 'Ride chosen', tone: 'brand' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

function verificationText(trip) {
  const status = trip.verification?.status;
  if (status === 'verified') return isDemoVerification(trip) ? 'Verified (demo check)' : 'Verified';
  if (status === 'failed') return 'Verification failed - you can try again';
  return 'Not verified yet';
}

function Badge({ tone, children }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const t = {
    warning: [colors.warningSurface, colors.warningText],
    success: [colors.successSurface, colors.successText],
    brand: [colors.primarySoft, colors.primarySoftText],
    neutral: [colors.surfaceMuted, colors.textSecondary],
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t[0] }]}>
      <Text style={[styles.badgeText, { color: t[1] }]}>{children}</Text>
    </View>
  );
}

export default function TripCard({ trip, onPress }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const booked = trip.booking?.status === 'confirmed';
  const status = booked ? { label: 'Booked', tone: 'success' } : (STATUS[trip.status] ?? { label: trip.status, tone: 'neutral' });
  const flight = trip.flight?.flightNumber;
  const landing = trip.flight?.scheduledArrivalTime ?? trip.expectedArrivalTime;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Trip to ${trip.destination}, ${formatDate(trip.travelDate)}, ${status.label}`}
      testID="trip-card"
      style={({ pressed }) => [styles.card, pressed && styles.pressed, trip.status === 'cancelled' && styles.cancelled]}
    >
      <View style={styles.top}>
        <Badge tone={status.tone}>{status.label}</Badge>
        <ChevronRightIcon size={18} color={colors.textMuted} />
      </View>

      <View style={styles.route}>
        <View style={styles.line}>
          <PlaneIcon size={16} color={colors.textMuted} />
          <AppText variant="small" numberOfLines={1} style={styles.flex}>
            {pickupLabel(trip)}
          </AppText>
        </View>
        <View style={styles.line}>
          <MapPinIcon size={16} color={colors.primaryIcon} />
          <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>
            {trip.destination}
          </AppText>
        </View>
      </View>

      <View style={styles.facts}>
        <View style={styles.fact}>
          <AppText variant="caption">Flight</AppText>
          {flight ? <FlightCode>{formatFlightNumber(flight)}</FlightCode> : <AppText variant="label">Not added yet</AppText>}
        </View>
        <View style={styles.fact}>
          <AppText variant="caption">Arrives</AppText>
          <View style={styles.line}>
            <CalendarIcon size={14} color={colors.textMuted} />
            <AppText variant="label">
              {formatDate(trip.travelDate)} · {formatTime(landing)}
            </AppText>
          </View>
        </View>
      </View>

      <AppText variant="caption" style={styles.verification} testID="trip-verification">
        Verification: {verificationText(trip)}
      </AppText>
      {trip.ride ? (
        <AppText variant="caption" testID="trip-ride">
          Ride: {rideTitle(trip.ride)}
        </AppText>
      ) : null}
      {trip.booking ? (
        <AppText variant="caption" testID="trip-booking">
          Booking {trip.booking.reference} · {trip.booking.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
        </AppText>
      ) : null}
      {/* Group chat: only for a confirmed booking in a shared ride */}
      {booked && trip.booking.mode === 'shared' && trip.poolId ? (
        <Pressable
          onPress={() => router.push({ pathname: '/chat/[poolId]', params: { poolId: trip.poolId } })}
          accessibilityRole="button"
          accessibilityLabel="Open the group chat of this shared ride"
          testID="trip-chat"
          style={({ pressed }) => [styles.chat, pressed && styles.chatPressed]}
        >
          <ChatIcon size={18} color={colors.primaryIcon} />
          <Text style={styles.chatText}>Group chat</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: borderWidth.hairline,
    borderRadius: radius.xl,
    padding: spacing[4],
    gap: spacing[3],
    ...shadow.card,
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  cancelled: { opacity: 0.75 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { borderRadius: radius.full, paddingHorizontal: spacing[2] + 2, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: fontWeight.semibold },
  route: { gap: spacing[1] },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  fact: { gap: 4 },
  verification: {},
  chat: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
  },
  chatPressed: { backgroundColor: colors.primarySoftPressed },
  chatText: { fontSize: 14, fontWeight: fontWeight.semibold, color: colors.primarySoftText },
}));

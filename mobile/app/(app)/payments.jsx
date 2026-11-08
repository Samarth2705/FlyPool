// Payment history: the logged-in passenger's own payments (GET /payments),
// newest first. Read from the server every time, so it is the same after a
// restart or logging in again. Tapping one opens that booking's payment.
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import AppHeader from '../../src/components/AppHeader';
import AppText from '../../src/components/AppText';
import Alert from '../../src/components/Alert';
import Button from '../../src/components/Button';
import Card from '../../src/components/Card';
import FormScreen from '../../src/components/FormScreen';
import PaymentStatusBadge from '../../src/components/PaymentStatusBadge';
import { TicketIcon } from '../../src/components/icons';
import { listMyPayments } from '../../src/api/payments.api';
import { formatRupees } from '../../src/shared/format';
import { RIDE_LABELS, VEHICLE_LABELS } from '../../src/shared/payments';
import { makeStyles, radius, spacing, useTheme } from '../../src/theme';

const dateText = (iso) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(iso));

function PaymentRow({ payment }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={() => payment.trip && router.push({ pathname: '/trip/[tripId]/payment', params: { tripId: payment.trip.id } })}
      accessibilityRole="button"
      accessibilityLabel={`Payment for booking ${payment.bookingReference}, ${formatRupees(payment.amount)}, ${payment.status}`}
      testID="payment-row"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowHead}>
        <AppText variant="bodyStrong" style={styles.flex}>
          {payment.bookingReference}
        </AppText>
        <AppText variant="bodyStrong">{formatRupees(payment.amount)}</AppText>
      </View>
      <AppText variant="small">
        {dateText(payment.createdAt)} · {RIDE_LABELS[payment.rideMode]} · {VEHICLE_LABELS[payment.vehicleType]}
        {payment.trip?.destination ? ` · to ${payment.trip.destination}` : ''}
      </AppText>
      <View style={styles.rowFoot}>
        <PaymentStatusBadge status={payment.status} />
        {payment.mode === 'demo' ? <AppText variant="caption">Demo - no money moved</AppText> : null}
      </View>
    </Pressable>
  );
}

export default function PaymentHistoryScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const [payments, setPayments] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      listMyPayments().then(
        (list) => {
          setError(null);
          setPayments(list);
        },
        setError,
      ),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function pullToRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <FormScreen header={<AppHeader showBack title="Payments" />} onRefresh={pullToRefresh} refreshing={refreshing}>
      <View style={styles.intro}>
        <AppText variant="title" accessibilityRole="header">
          Payments
        </AppText>
        <AppText variant="small">Your own payments for FlyPool bookings.</AppText>
      </View>
      {!payments && !error && <ActivityIndicator style={styles.loading} color={colors.primary} accessibilityLabel="Loading payments" />}
      {error && error.status !== 401 && (
        <View style={styles.gap}>
          <Alert tone="error" title="We couldn’t load your payments">
            {error.message}
          </Alert>
          <Button variant="secondary" onPress={load} testID="payments-retry">
            Try again
          </Button>
        </View>
      )}
      {payments && payments.length === 0 && (
        <Card style={styles.empty} testID="payments-empty">
          <TicketIcon size={28} color={colors.primaryIcon} />
          <AppText variant="body" style={styles.center}>
            No payments yet. Payments for your bookings will appear here.
          </AppText>
        </Card>
      )}
      {payments && payments.length > 0 && (
        <View style={styles.gap} testID="payments-list">
          {payments.map((p) => (
            <PaymentRow key={p.id} payment={p} />
          ))}
        </View>
      )}
    </FormScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  intro: { gap: spacing[1], marginBottom: spacing[5] },
  loading: { marginTop: spacing[10] },
  gap: { gap: spacing[3] },
  empty: { alignItems: 'center', gap: spacing[3], paddingVertical: spacing[6] },
  row: {
    gap: spacing[1],
    padding: spacing[4],
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  rowFoot: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginTop: spacing[1] },
}));

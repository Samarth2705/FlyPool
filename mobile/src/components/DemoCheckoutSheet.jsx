// DEMO checkout: stands in for a payment provider's checkout while FlyPool
// has none. Says plainly that it is a simulation - no card, UPI or bank
// details are asked for, and no money moves. The chosen result is sent to the
// server (POST /payments/:id/demo-result), which decides the status.
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from './AppText';
import Alert from './Alert';
import Button from './Button';
import { formatRupees } from '../shared/format';
import { layout, makeStyles, radius, spacing } from '../theme';

export default function DemoCheckoutSheet({ visible, amount, busy, onResult, onClose }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !busy && onClose()} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={() => !busy && onClose()} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing[4] }]} accessibilityViewIsModal testID="demo-checkout">
          <AppText variant="overline">Demo checkout</AppText>
          <AppText variant="title">{formatRupees(amount)}</AppText>
          <Alert tone="warning" title="This is a simulated payment">
            No real money is charged or transferred, and no card, UPI or bank details are needed. Choose what should
            happen to test the payment flow.
          </Alert>
          <Button onPress={() => onResult('success')} loading={busy} testID="demo-success">
            Simulate successful payment
          </Button>
          <Button variant="danger" onPress={() => onResult('failure')} disabled={busy} testID="demo-failure">
            Simulate failed payment
          </Button>
          <Button variant="secondary" onPress={() => onResult('cancelled')} disabled={busy} testID="demo-cancel">
            Cancel payment
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl + 4,
    borderTopRightRadius: radius.xl + 4,
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: layout.screenPadding,
    gap: spacing[3],
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
  },
}));

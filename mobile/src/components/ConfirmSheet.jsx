// A confirmation bottom sheet for actions that change a booking (cancel,
// leave a shared ride). It explains what will happen, may take extra input
// (children), and has a clear way back. Tapping outside = go back.
//   <ConfirmSheet visible title="Cancel booking?" message="..." confirmLabel="Cancel booking"
//     backLabel="Keep booking" onConfirm={...} onClose={...} busy={...} />
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from './AppText';
import Button from './Button';
import { layout, makeStyles, radius, spacing } from '../theme';

export default function ConfirmSheet({ visible, title, message, children, confirmLabel, backLabel = 'Go back', onConfirm, onClose, busy, testID }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !busy && onClose()} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={() => !busy && onClose()}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          testID={testID ? `${testID}-backdrop` : undefined}
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing[4] }]} accessibilityViewIsModal testID={testID}>
          <AppText variant="heading" accessibilityRole="header">
            {title}
          </AppText>
          {message ? <AppText variant="small">{message}</AppText> : null}
          {children}
          <Button variant="danger" onPress={onConfirm} loading={busy} testID={testID ? `${testID}-confirm` : undefined}>
            {confirmLabel}
          </Button>
          <Button variant="secondary" onPress={onClose} disabled={busy} testID={testID ? `${testID}-back` : undefined}>
            {backLabel}
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

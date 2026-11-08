// A payment status chip: Paid / Waiting for payment / Failed / ...
import { Text, View } from 'react-native';
import { PAYMENT_STATUS, toneColors } from '../shared/payments';
import { fontWeight, radius, spacing, useTheme } from '../theme';

export default function PaymentStatusBadge({ status, testID }) {
  const { colors } = useTheme();
  const s = PAYMENT_STATUS[status ?? 'none'] ?? PAYMENT_STATUS.none;
  const [bg, fg] = toneColors(s.tone, colors);
  return (
    <View
      style={{ alignSelf: 'flex-start', backgroundColor: bg, borderRadius: radius.full, paddingHorizontal: spacing[2] + 2, paddingVertical: 3 }}
      testID={testID}
    >
      <Text style={{ color: fg, fontSize: 12, fontWeight: fontWeight.semibold }}>{s.label}</Text>
    </View>
  );
}

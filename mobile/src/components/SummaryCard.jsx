// A titled section of the Booking Summary / confirmation, with an optional
// "Edit" link, and label-value rows.
//   <SummaryCard title="Trip details" onEdit={...} editLabel="Edit trip details">
//     <SummaryRow label="Destination" value="Powai" />
//   </SummaryCard>
import { Pressable, View } from 'react-native';
import AppText from './AppText';
import Card from './Card';
import { fontWeight, makeStyles, spacing } from '../theme';

// testID goes on the value (or on the whole row when it has custom content)
export function SummaryRow({ label, value, children, strong, testID }) {
  const styles = useStyles();
  return (
    <View style={styles.row} testID={children ? testID : undefined}>
      <AppText variant="small" style={styles.label}>
        {label}
      </AppText>
      {children ?? (
        <AppText variant={strong ? 'bodyStrong' : 'label'} style={styles.value} testID={testID}>
          {value}
        </AppText>
      )}
    </View>
  );
}

export default function SummaryCard({ title, onEdit, editLabel, testID, children }) {
  const styles = useStyles();
  return (
    <Card style={styles.card} testID={testID}>
      <View style={styles.head}>
        <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
          {title}
        </AppText>
        {onEdit ? (
          <Pressable
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel={editLabel ?? `Edit ${title.toLowerCase()}`}
            hitSlop={8}
            testID={testID ? `${testID}-edit` : undefined}
          >
            <AppText variant="label" style={styles.edit}>
              Edit
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {children}
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  card: { padding: spacing[4], gap: spacing[1] },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[1] },
  edit: { color: colors.link, fontWeight: fontWeight.semibold },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[4],
    paddingVertical: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  label: { flexShrink: 0, maxWidth: '50%' },
  value: { flexShrink: 1, textAlign: 'right' },
}));

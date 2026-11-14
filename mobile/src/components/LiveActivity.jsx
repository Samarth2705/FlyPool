// The live activity line on the ride screens: how many other compatible
// passengers are choosing a ride now, and the latest change (a new shared ride,
// someone joined, full...). Everything comes from the server via useLiveRide;
// it updates every few seconds (polling), so it's described as "live", not instant.
//   <LiveActivity live={useLiveRide(tripId)} />
import { View } from 'react-native';
import AppText from './AppText';
import { UsersIcon } from './icons';
import { consideringText } from '../live/useLiveRide';
import { makeStyles, radius, spacing, useTheme } from '../theme';

export default function LiveActivity({ live, testID = 'live-activity' }) {
  const { colors } = useTheme();
  const styles = useStyles();
  if (!live?.loaded) return null;
  const count = consideringText(live.othersConsidering);
  if (!count && !live.notice && !live.stale) return null;
  return (
    <View style={styles.box} accessibilityLiveRegion="polite" testID={testID}>
      <View style={styles.dot} />
      <View style={styles.flex}>
        {live.notice ? (
          <AppText variant="label" style={styles.notice} testID={`${testID}-notice`}>
            {live.notice.text}
          </AppText>
        ) : null}
        {count ? (
          <View style={styles.row}>
            <UsersIcon size={16} color={colors.primaryIcon} />
            <AppText variant="small" style={styles.flex} testID={`${testID}-count`}>
              {count}
            </AppText>
          </View>
        ) : null}
        {live.stale ? (
          <AppText variant="caption" testID={`${testID}-stale`}>
            Can’t update right now - showing the last known numbers.
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  box: {
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    marginBottom: spacing[4],
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: colors.success },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  notice: { color: colors.primarySoftText, marginBottom: spacing[1] },
}));

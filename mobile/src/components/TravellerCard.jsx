// One compatible traveller from GET /trips/:id/matches.
// Shows only what the server shares: drop-off area, group size, flight and
// landing time - never a name, contact details or an exact address (the
// server doesn't send them). "Why you match" restates the server's own
// matching rules for this traveller; nothing is guessed on the phone.
//   <TravellerCard traveller={t} index={0} trip={myTrip} windowMinutes={60} />
import { View } from 'react-native';
import AppText from './AppText';
import Card from './Card';
import FlightCode from './FlightCode';
import { CheckIcon, UsersIcon } from './icons';
import { formatFlightNumber } from '../shared/format';
import { plural, terminalLabel } from '../shared/trips';
import { landingTime, landsRelative } from '../utils/travellers';
import { makeStyles, radius, spacing, useTheme } from '../theme';

const badgeTone = (tone, c) =>
  tone === 'brand'
    ? { box: { backgroundColor: c.primary }, text: { color: c.textOnBrand } }
    : { box: { backgroundColor: c.warningSurface }, text: { color: c.warningText } };

function Badge({ tone, children }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const t = badgeTone(tone, colors);
  return (
    <View style={[styles.badge, t.box]}>
      <AppText variant="caption" style={t.text}>
        {children}
      </AppText>
    </View>
  );
}

function Fact({ label, children, caption }) {
  const styles = useStyles();
  return (
    <View style={styles.fact}>
      <AppText variant="caption">{label}</AppText>
      {typeof children === 'string' ? <AppText variant="label">{children}</AppText> : children}
      {caption ? <AppText variant="caption">{caption}</AppText> : null}
    </View>
  );
}

function Reason({ children }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.reason}>
      <CheckIcon size={16} color={colors.success} />
      <AppText variant="small" style={styles.flex}>
        {children}
      </AppText>
    </View>
  );
}

export default function TravellerCard({ traveller, index, trip, windowMinutes }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { dateText, timeText } = landingTime(trip, traveller.minutesApart);
  const terminal = terminalLabel(trip);
  const name = `Traveller ${index + 1}`;

  return (
    <Card testID="traveller-card" style={styles.card}>
      <View style={styles.head}>
        <View style={styles.avatar}>
          <UsersIcon size={22} color={colors.primaryIcon} />
        </View>
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{name}</AppText>
          <AppText variant="caption">Verified flight</AppText>
        </View>
        <View style={styles.badges}>
          {traveller.sameFlight && <Badge tone="brand">Same flight</Badge>}
          {traveller.isDemo && <Badge tone="warning">Sample data</Badge>}
        </View>
      </View>

      <View style={styles.facts}>
        <Fact label="Flight">
          {traveller.flightNumber ? <FlightCode>{formatFlightNumber(traveller.flightNumber)}</FlightCode> : '—'}
        </Fact>
        <Fact label="Lands" caption={landsRelative(traveller.minutesApart)}>
          {`${timeText} · ${dateText}`}
        </Fact>
        <Fact label="Going to">{traveller.area ?? trip.destination}</Fact>
        <Fact label="Group">{plural(traveller.partySize, 'person', 'people')}</Fact>
      </View>

      <View style={styles.reasons} accessibilityLabel={`Why ${name} matches your trip`}>
        <AppText variant="overline">Why you match</AppText>
        <Reason>
          {traveller.sameFlight
            ? 'Same flight as you'
            : `Lands within ${windowMinutes} min of you (${landsRelative(traveller.minutesApart).toLowerCase()})`}
        </Reason>
        {terminal ? <Reason>{`Same pickup: ${terminal}`}</Reason> : null}
        <Reason>
          {traveller.area
            ? `Drop-off in ${traveller.area} fits your route - no one’s trip gets much longer`
            : 'Same destination as yours'}
        </Reason>
      </View>
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  card: { padding: spacing[4] },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badges: { alignItems: 'flex-end', gap: spacing[1] },
  badge: { borderRadius: radius.full, paddingHorizontal: spacing[2], paddingVertical: 2 },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border,
    rowGap: spacing[3],
  },
  fact: { width: '50%', paddingRight: spacing[2], gap: 2 },
  reasons: {
    marginTop: spacing[4],
    padding: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    gap: spacing[2],
  },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
}));

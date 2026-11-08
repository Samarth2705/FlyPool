// The fare estimate for the current ride choice - exactly the numbers the
// server worked out (GET /trips/:id/matches -> vehicles[].soloFare and
// vehicles[].pools[].fare; see server/src/services/fare.service.js). Nothing
// is calculated here. When the server has no estimate (a drop-off area it
// can't place), that is said plainly instead of showing a price.
//   <FareSummary fare={...} kind="solo|join|new|mine" partySize={2} assumptions={[...]} />
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import AppText from './AppText';
import Card from './Card';
import { formatRupees } from '../shared/format';
import { plural } from '../shared/trips';
import { fontWeight, makeStyles, spacing } from '../theme';

const perPersonText = ({ min, max }) => (min === max ? formatRupees(min) : `${formatRupees(min)}–${formatRupees(max)}`);

const NOTES = {
  solo: 'You pay for the whole cab - the fare isn’t split with anyone.',
  join: 'Estimate if you join this shared ride. It changes as travellers join or leave.',
  mine: 'Current estimate for your shared ride. It changes as travellers join or leave.',
  new: 'You’ll start a shared ride that compatible travellers can join. Until someone joins, the estimate is the full fare; the cost per person drops as people join.',
};

function Row({ label, value, strong, testID }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <AppText variant="small">{label}</AppText>
      <AppText variant={strong ? 'bodyStrong' : 'label'} style={styles.value} testID={testID}>
        {value}
      </AppText>
    </View>
  );
}

export default function FareSummary({ fare, kind, partySize, assumptions = [] }) {
  const styles = useStyles();
  const [showHow, setShowHow] = useState(false);

  if (!fare) {
    return (
      <Card style={styles.card} testID="fare-summary">
        <AppText variant="overline">Estimated fare</AppText>
        <AppText variant="small" testID="fare-unavailable">
          No fare estimate for this trip yet - FlyPool’s pricing rules only cover drop-offs in the Mumbai areas it knows.
          Your choice can still be saved.
        </AppText>
      </Card>
    );
  }

  const yourShare = kind === 'solo' || kind === 'new' ? fare.total : fare.yourShare;
  const soloFare = kind === 'solo' ? null : (fare.soloFare ?? fare.total);
  const savingsPerPerson =
    kind === 'join' || kind === 'mine' ? fare.savingsPerPerson : kind === 'new' ? 0 : null;

  return (
    <Card style={styles.card} testID="fare-summary">
      <View style={styles.head}>
        <AppText variant="overline">Estimated fare</AppText>
        <AppText variant="caption">Estimate · INR</AppText>
      </View>
      <Row label="Total for the cab" value={formatRupees(fare.total)} testID="fare-total" />
      <Row label="Passengers" value={plural(fare.people, 'person', 'people')} testID="fare-people" />
      <Row label="Per person" value={perPersonText(fare.perPerson)} testID="fare-per-person" />
      {kind !== 'solo' && (
        <Row
          label={partySize > 1 ? `Your share (${partySize} people)` : 'Your share'}
          value={formatRupees(yourShare)}
          strong
          testID="fare-your-share"
        />
      )}
      {kind === 'solo' && <Row label="You pay" value={formatRupees(fare.total)} strong testID="fare-your-share" />}
      {savingsPerPerson != null && (
        <Row
          label="Saving vs travelling alone"
          value={savingsPerPerson > 0 ? `${formatRupees(savingsPerPerson)} per person` : 'None until someone joins'}
          testID="fare-savings"
        />
      )}
      {kind !== 'solo' && soloFare != null && kind !== 'new' && (
        <AppText variant="caption">Alone in this vehicle: about {formatRupees(soloFare)}.</AppText>
      )}
      <AppText variant="caption" style={styles.note}>
        {NOTES[kind]}
      </AppText>

      {assumptions.length > 0 && (
        <View>
          <Pressable
            onPress={() => setShowHow((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showHow }}
            hitSlop={6}
          >
            <AppText variant="label" style={styles.link}>
              {showHow ? 'Hide how this is estimated' : 'How is this estimated?'}
            </AppText>
          </Pressable>
          {showHow &&
            assumptions.map((line) => (
              <AppText key={line} variant="caption" style={styles.assumption}>
                • {line}
              </AppText>
            ))}
        </View>
      )}
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { gap: spacing[2] },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[1] },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[4],
    paddingVertical: spacing[1],
  },
  value: { flexShrink: 1, textAlign: 'right' },
  note: { marginTop: spacing[1] },
  link: { color: colors.link, fontWeight: fontWeight.semibold, paddingVertical: spacing[1] },
  assumption: { marginTop: spacing[1] },
}));

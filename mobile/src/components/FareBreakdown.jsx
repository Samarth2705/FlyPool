// The fare breakdown of a saved ride or booking - only numbers the server
// sent (fare.breakdown from server/src/services/fare.service.js: base fare,
// distance charge, minimum fare, rounding). No taxes, discounts or extra
// charges exist in FlyPool's pricing rules, so none are shown or added.
// Without an estimate it says so instead of showing a price.
//   <FareBreakdown fare={fare} mode="shared" partySize={2} />
import { View } from 'react-native';
import AppText from './AppText';
import { SummaryRow } from './SummaryCard';
import { formatRupees } from '../shared/format';
import { plural } from '../shared/trips';
import { makeStyles, spacing } from '../theme';

export const NO_FARE_TEXT = 'Final fare will be available once ride pricing is confirmed.';

const perPersonText = ({ min, max }) => (min === max ? formatRupees(min) : `${formatRupees(min)}–${formatRupees(max)}`);

export default function FareBreakdown({ fare, mode, partySize, assumptions = [] }) {
  const styles = useStyles();
  if (!fare) {
    return (
      <AppText variant="small" testID="fare-unavailable">
        {NO_FARE_TEXT}
      </AppText>
    );
  }

  const b = fare.breakdown;
  const yourShare = mode === 'solo' ? fare.total : fare.yourShare;
  return (
    <View testID="fare-breakdown">
      {b ? (
        <>
          <SummaryRow label="Base fare" value={formatRupees(b.baseFare)} testID="fare-base" />
          <SummaryRow
            label={`Distance (${b.roadKm} km × ${formatRupees(b.perKm)})`}
            value={formatRupees(b.distanceCharge)}
            testID="fare-distance"
          />
          {b.minimumApplied ? (
            <SummaryRow label="Minimum fare applies" value={formatRupees(b.minimumFare)} testID="fare-minimum" />
          ) : null}
          {b.roundingAdjustment && !b.minimumApplied ? (
            <SummaryRow label="Rounding (to ₹10)" value={formatRupees(b.roundingAdjustment)} testID="fare-rounding" />
          ) : null}
        </>
      ) : null}
      <SummaryRow label="Estimated total for the cab" value={formatRupees(fare.total)} strong testID="fare-total" />
      {mode === 'shared' ? (
        <>
          <SummaryRow label={`Per person (${plural(fare.people, 'person', 'people')})`} value={perPersonText(fare.perPerson)} testID="fare-per-person" />
          <SummaryRow
            label={partySize > 1 ? `Your share (${partySize} people)` : 'Your share'}
            value={formatRupees(yourShare)}
            strong
            testID="fare-your-share"
          />
        </>
      ) : (
        <SummaryRow label="You pay (whole cab)" value={formatRupees(fare.total)} strong testID="fare-your-share" />
      )}
      <AppText variant="caption" style={styles.note}>
        Estimate in INR from FlyPool’s pricing rules - not a live taxi quote.
        {mode === 'shared' ? ' A shared ride’s fare changes if travellers join or leave.' : ''}
      </AppText>
      {assumptions
        .filter((line) => /^Excludes/.test(line))
        .map((line) => (
          <AppText key={line} variant="caption" style={styles.note} testID="fare-excludes">
            {line}
          </AppText>
        ))}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  note: { marginTop: spacing[2] },
}));

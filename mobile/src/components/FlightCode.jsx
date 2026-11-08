// A flight number or time in the style of an airport departure board:
// yellow monospace characters on dark ink (as on the web).
//   <FlightCode>6E 2134</FlightCode>
import { Text, View } from 'react-native';
import { makeStyles, radius, spacing, typography } from '../theme';

export default function FlightCode({ children, style }) {
  const styles = useStyles();
  return (
    <View style={[styles.box, style]}>
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: {
    alignSelf: 'flex-start',
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  text: { ...typography.code, color: colors.accent },
}));

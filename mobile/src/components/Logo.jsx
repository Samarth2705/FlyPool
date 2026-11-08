// FlyPool logo: taxi-yellow plane on an ink tile + the name (as on the web).
// size: "md" or "sm"; onDark: white wordmark, for dark brand panels
import { Text, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { PLANE_SOLID_PATH } from './icons';
import { fontWeight, makeStyles, radius, useTheme } from '../theme';

const SIZES = {
  md: { tile: 40, icon: 20, text: 24, corner: radius.lg },
  sm: { tile: 32, icon: 16, text: 18, corner: radius.md },
};

export default function Logo({ size = 'md', onDark = false }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const s = SIZES[size];
  return (
    <View style={styles.row} accessible accessibilityRole="image" accessibilityLabel="FlyPool">
      <View style={[styles.tile, { width: s.tile, height: s.tile, borderRadius: s.corner }]}>
        <Svg width={s.icon} height={s.icon} viewBox="0 0 24 24">
          {/* Rotated 45° like the web logo */}
          <G rotation={45} origin="12, 12">
            <Path d={PLANE_SOLID_PATH} fill={colors.accent} />
          </G>
        </Svg>
      </View>
      <Text style={[styles.word, { fontSize: s.text, color: onDark ? colors.textOnDark : colors.text }]}>FlyPool</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    borderWidth: 1,
    borderColor: colors.inkBorder,
  },
  word: { fontWeight: fontWeight.bold, letterSpacing: -0.4 },
}));

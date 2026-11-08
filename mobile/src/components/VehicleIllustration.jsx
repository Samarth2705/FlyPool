// A side view of a Sedan or an SUV in FlyPool colours (blue body, taxi-yellow
// stripe), drawn as SVG so it is sharp at any size and follows light / dark
// mode. Decorative: the card around it names the vehicle.
//   <VehicleIllustration type="suv" width={112} />
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from '../theme';

const SHAPES = {
  sedan: {
    body: 'M6 40 L6 32 Q8 27 17 26 L35 24 L47 14 Q50 12 55 12 L78 12 Q83 12 87 16 L96 24 L108 26 Q114 27 114 33 L114 40 Z',
    windows: ['M39 24 L49 16 Q51 15 54 15 L64 15 L64 24 Z', 'M68 15 L78 15 Q81 15 84 18 L90 24 L68 24 Z'],
    stripeY: 32,
    wheelR: 8,
  },
  suv: {
    body: 'M6 40 L6 25 Q6 21 10 21 L22 20 L30 8 Q32 6 36 6 L90 6 Q96 6 99 10 L106 20 Q114 21 114 27 L114 40 Z',
    windows: ['M33 20 L39 10 L60 10 L60 20 Z', 'M64 10 L88 10 Q92 10 94 13 L99 20 L64 20 Z'],
    stripeY: 29,
    wheelR: 9,
  },
};

export default function VehicleIllustration({ type, width = 112, muted = false }) {
  const { colors } = useTheme();
  const s = SHAPES[type] ?? SHAPES.sedan;
  const body = muted ? colors.borderStrong : colors.primary;
  return (
    <Svg width={width} height={(width * 52) / 120} viewBox="0 0 120 52" accessible={false}>
      <Path d={s.body} fill={body} />
      {s.windows.map((d) => (
        <Path key={d} d={d} fill={colors.primarySoft} />
      ))}
      <Rect x={8} y={s.stripeY} width={104} height={2.5} rx={1} fill={muted ? colors.surfaceMuted : colors.accent} />
      {[30, 92].map((cx) => (
        <Circle key={cx} cx={cx} cy={41} r={s.wheelR} fill={colors.ink} />
      ))}
      {[30, 92].map((cx) => (
        <Circle key={`hub-${cx}`} cx={cx} cy={41} r={3} fill={colors.borderStrong} />
      ))}
    </Svg>
  );
}

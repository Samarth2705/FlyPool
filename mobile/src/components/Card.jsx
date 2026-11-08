// The standard surface for content: white panel, hairline border, soft shadow.
import { View } from 'react-native';
import { borderWidth, makeStyles, radius, shadow, spacing } from '../theme';

export default function Card({ style, children, ...props }) {
  const styles = useStyles();
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: borderWidth.hairline,
    borderRadius: radius.xl,
    padding: spacing[5],
    ...shadow.card,
  },
}));

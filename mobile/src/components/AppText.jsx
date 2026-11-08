// Text in one of the theme's type styles: <AppText variant="title">Hi</AppText>
// Variants: display, title, heading, body, bodyStrong, label, small, caption,
// overline, code (see src/theme/typography.js). The colour follows the
// variant and light / dark mode; `style` is applied last.
import { Text } from 'react-native';
import { TEXT_TONE, typography, useTheme } from '../theme';

export default function AppText({ variant = 'body', style, ...props }) {
  const { colors } = useTheme();
  return <Text style={[typography[variant], { color: colors[TEXT_TONE[variant]] }, style]} {...props} />;
}

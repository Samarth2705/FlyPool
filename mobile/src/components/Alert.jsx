// A coloured message box with an icon (like the web app's Alert).
//   <Alert tone="error" title="Couldn’t log you in">Message</Alert>
// tone: "error" | "warning" | "success" | "info"
import { StyleSheet, View } from 'react-native';
import AppText from './AppText';
import { AlertIcon, CheckIcon } from './icons';
import { radius, spacing, useTheme } from '../theme';

function toneColors(tone, c) {
  switch (tone) {
    case 'error':
      return { bg: c.dangerSurface, border: c.dangerBorder, text: c.dangerText, icon: c.danger, Icon: AlertIcon };
    case 'warning':
      return { bg: c.warningSurface, border: c.warningBorder, text: c.warningText, icon: c.warningIcon, Icon: AlertIcon };
    case 'success':
      return { bg: c.successSurface, border: c.successBorder, text: c.successText, icon: c.successIcon, Icon: CheckIcon };
    default:
      return { bg: c.primarySoft, border: c.primarySoftBorder, text: c.primarySoftText, icon: c.primaryIcon, Icon: AlertIcon };
  }
}

export default function Alert({ tone = 'info', title, children, style, testID }) {
  const { colors } = useTheme();
  const t = toneColors(tone, colors);
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : 'summary'}
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
      style={[styles.box, { backgroundColor: t.bg, borderColor: t.border }, style]}
      testID={testID}
    >
      <t.Icon size={20} color={t.icon} />
      <View style={styles.text}>
        {title ? (
          <AppText variant="label" style={{ color: t.text }}>
            {title}
          </AppText>
        ) : null}
        {children ? (
          <AppText variant="small" style={{ color: t.text }}>
            {children}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: spacing[3], padding: spacing[3] + 2, borderRadius: radius.lg, borderWidth: 1 },
  text: { flex: 1, gap: 2 },
});

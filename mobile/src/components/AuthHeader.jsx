// The brand band at the top of the login and register screens (the web
// app's dark panel, compact for phones).
import { View } from 'react-native';
import AppText from './AppText';
import Logo from './Logo';
import { makeStyles, radius, spacing } from '../theme';

export default function AuthHeader() {
  const styles = useStyles();
  return (
    <View style={styles.band}>
      <Logo size="sm" onDark />
      <AppText variant="title" style={styles.title}>
        Landed in Mumbai?{' '}
        <AppText variant="title" style={styles.accent}>
          Share the cab home.
        </AppText>
      </AppText>
      <AppText variant="small" style={styles.text}>
        Verified passengers from around your flight, heading your way.
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  band: { backgroundColor: colors.brandPanel, borderRadius: radius.xl, padding: spacing[5] },
  title: { color: colors.textOnDark, marginTop: spacing[5] },
  accent: { color: colors.accent },
  text: { color: colors.textOnDarkMuted, marginTop: spacing[2] },
}));

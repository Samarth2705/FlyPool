// Another passenger, from the server's `profile`:
//   name ("Asha V."), age (if they entered a date of birth), gender (only if
//   they chose to show it), identity-check status
//   { shared: false } only for an account that no longer exists.
// The server never sends a date of birth, email, phone or identity details.
//   <TravellerProfile profile={member.profile} fallback="Traveller 1" />
import { View } from 'react-native';
import AppText from './AppText';
import { makeStyles, radius, spacing, useTheme } from '../theme';

export const GENDER_LABELS = { female: 'Female', male: 'Male', non_binary: 'Non-binary' };

// "Asha V. · 29 · Female" (only what was shared)
export function profileLine(profile, fallback = 'Traveller') {
  if (!profile?.shared) return fallback;
  return [profile.name, profile.age != null ? `${profile.age}` : null, GENDER_LABELS[profile.gender] ?? null].filter(Boolean).join(' · ');
}

export function IdentityBadge({ identity, testID }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const verified = identity === 'verified';
  return (
    <View
      style={[styles.badge, { backgroundColor: verified ? colors.successSurface : colors.surfaceMuted }]}
      accessibilityLabel={verified ? 'ID checked (manual demo check)' : 'ID not checked'}
      testID={testID}
    >
      <AppText variant="caption" style={{ color: verified ? colors.successText : colors.textMuted }}>
        {verified ? 'ID checked' : 'ID not checked'}
      </AppText>
    </View>
  );
}

export default function TravellerProfile({ profile, fallback = 'Traveller', testID = 'traveller-profile' }) {
  const styles = useStyles();
  if (!profile) return null; // this view has no profile information at all
  return (
    <View style={styles.row} testID={testID}>
      <AppText variant="bodyStrong" style={styles.flex} testID={`${testID}-name`}>
        {profileLine(profile, fallback)}
      </AppText>
      {profile.shared ? (
        <IdentityBadge identity={profile.identity} testID={`${testID}-identity`} />
      ) : (
        <AppText variant="caption" testID={`${testID}-not-shared`}>
          Profile not shared
        </AppText>
      )}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  badge: { paddingHorizontal: spacing[2], paddingVertical: 2, borderRadius: radius.full },
}));

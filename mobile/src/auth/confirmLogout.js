// "Log out of FlyPool?" - asked before logging out from the account menu or
// Settings. On "Log out" it calls the existing AuthProvider.signOut (the
// server revokes the token, the device forgets it) and the navigator shows
// the login screen.
import { Alert } from 'react-native';

export function confirmLogout(signOut, { onStart } = {}) {
  Alert.alert('Log out of FlyPool?', 'You’ll need your email and password to log in again.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Log out',
      style: 'destructive',
      onPress: async () => {
        onStart?.();
        await signOut();
      },
    },
  ]);
}

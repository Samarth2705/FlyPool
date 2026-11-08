// The passenger's profile picture. The backend stores no photo, so it shows
// their initials (as on the web).
//   <Avatar name="Asha Verma" size={36} />
import { Text, View } from 'react-native';
import { initialsOf } from '../shared/format';
import { fontWeight, radius, useTheme } from '../theme';

export default function Avatar({ name, size = 36, style }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius.full,
          backgroundColor: colors.primarySoft,
          borderWidth: 1,
          borderColor: colors.primarySoftBorder,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text style={{ color: colors.primarySoftText, fontWeight: fontWeight.semibold, fontSize: Math.round(size * 0.38) }}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

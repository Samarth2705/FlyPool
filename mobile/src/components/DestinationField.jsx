// Text input with suggestions (like the web app's SuggestionInput), used for
// the destination and the airline name.
// The passenger can tap a suggestion OR keep whatever they typed - the
// backend accepts any area; suggestions are only shortcuts. Matching is
// from the start of any word: "and" finds "Andheri West", not "Bandra".
import { useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import AppText from './AppText';
import TextField from './TextField';
import { layout, makeStyles, radius, spacing } from '../theme';

const MAX_SHOWN = 6;

export function matchSuggestions(text, suggestions) {
  const query = text.trim().toLowerCase();
  return suggestions
    .filter((s) => {
      const candidate = s.toLowerCase();
      return candidate !== query && (candidate.startsWith(query) || candidate.includes(` ${query}`));
    })
    .slice(0, MAX_SHOWN);
}

export default function DestinationField({
  value,
  onChange,
  suggestions,
  error,
  hint,
  label = 'Destination',
  placeholder = 'Area, neighbourhood or landmark',
  testID = 'destination-input',
  disabled = false,
  suggestionCaption = 'Mumbai', // shown on each suggestion row (null for none)
}) {
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  const matches = focused ? matchSuggestions(value, suggestions) : [];

  return (
    <View>
      <TextField
        label={label}
        value={value}
        onChangeText={onChange}
        error={error}
        hint={hint}
        placeholder={placeholder}
        editable={!disabled}
        autoCapitalize="words"
        returnKeyType="done"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        testID={testID}
      />
      {matches.length > 0 && (
        <View style={styles.list} accessibilityLabel={`${label} suggestions`}>
          {matches.map((s, i) => (
            <Pressable
              key={s}
              onPress={() => {
                onChange(s);
                setFocused(false);
                Keyboard.dismiss();
              }}
              accessibilityRole="button"
              accessibilityLabel={suggestionCaption ? `${s}, ${suggestionCaption}` : s}
              style={({ pressed }) => [styles.item, i > 0 && styles.divider, pressed && styles.pressed]}
            >
              <AppText>{s}</AppText>
              {suggestionCaption ? <AppText variant="caption">{suggestionCaption}</AppText> : null}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  list: {
    marginTop: spacing[1],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  item: {
    minHeight: layout.minTouchTarget,
    paddingHorizontal: spacing[3] + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  pressed: { backgroundColor: colors.surfaceMuted },
}));

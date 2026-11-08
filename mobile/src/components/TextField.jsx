// A labelled text input with help text and an error message underneath
// (like the web app's TextField).
//   <TextField label="Email" value={email} onChangeText={setEmail} error={errors.email} />
// Extras: hint, prefix (e.g. "+91"), secure (adds a Show/Hide button),
// inputRef (to move focus), and any TextInput prop (keyboardType, ...).
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import AppText from './AppText';
import { AlertIcon } from './icons';
import { borderWidth, fontWeight, layout, makeStyles, radius, spacing, typography, useTheme } from '../theme';

export default function TextField({ label, error, hint, prefix, secure = false, inputRef, style, ...inputProps }) {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);

  return (
    <View style={style}>
      <AppText variant="label">{label}</AppText>
      <View
        style={[
          styles.box,
          focused && styles.boxFocused,
          error && styles.boxError,
        ]}
      >
        {prefix && (
          <View style={styles.prefix}>
            <Text style={styles.prefixText}>{prefix}</Text>
          </View>
        )}
        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          accessibilityHint={error || hint}
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={scheme}
          secureTextEntry={secure && hidden}
          autoCorrect={false}
          {...inputProps}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          style={styles.input}
        />
        {secure && (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            hitSlop={8}
            style={styles.toggle}
          >
            <Text style={styles.toggleText}>{hidden ? 'Show' : 'Hide'}</Text>
          </Pressable>
        )}
      </View>
      {hint ? <AppText variant="small" style={styles.message}>{hint}</AppText> : null}
      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <AlertIcon size={16} color={colors.danger} />
          <AppText variant="small" style={styles.errorText}>
            {error}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: {
    marginTop: spacing[1] + 2,
    minHeight: layout.inputHeight,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
  },
  boxFocused: { borderColor: colors.primary, borderWidth: borderWidth.thick },
  boxError: { borderColor: colors.danger },
  prefix: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  prefixText: { ...typography.body, color: colors.textMuted },
  input: { flex: 1, ...typography.body, color: colors.text, paddingHorizontal: spacing[3] + 2, paddingVertical: spacing[3] },
  toggle: { paddingHorizontal: spacing[3], minHeight: layout.minTouchTarget, justifyContent: 'center' },
  toggleText: { color: colors.link, fontWeight: fontWeight.semibold, fontSize: 14 },
  message: { marginTop: spacing[1] + 2 },
  errorRow: { flexDirection: 'row', gap: spacing[1] + 2, marginTop: spacing[1] + 2, alignItems: 'flex-start' },
  errorText: { flex: 1, color: colors.danger, fontWeight: fontWeight.medium },
}));

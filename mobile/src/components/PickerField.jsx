// A tappable field that opens the phone's native date or time picker.
//   <PickerField mode="date" label="Travel date" value="2026-11-06" onChange={...}
//     minimumDate="2026-11-05" maximumDate="2027-11-05" />
//   <PickerField mode="time" label="Landing time" value="18:30" onChange={...} />
// value / onChange use FlyPool's strings ("YYYY-MM-DD", "HH:mm"), '' when unset.
//
// Android: the system dialog (imperative API, as the library recommends).
// iOS: a bottom sheet with the inline calendar / time wheel and Done.
import { useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from './AppText';
import Button from './Button';
import { AlertIcon } from './icons';
import { formatDate, formatTime } from '../shared/dates';
import { isoToPickerDate, pickerDateToIso, pickerDateToTime, timeToPickerDate } from '../utils/pickerDates';
import { borderWidth, fontWeight, layout, makeStyles, radius, spacing, typography, useTheme } from '../theme';

export default function PickerField({ mode, label, value, onChange, minimumDate, maximumDate, placeholder, hint, error }) {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState(null);

  const isDate = mode === 'date';
  const toPicker = (v) => (isDate ? isoToPickerDate(v) : timeToPickerDate(v));
  const fromPicker = (d) => (isDate ? pickerDateToIso(d) : pickerDateToTime(d));
  const fallback = isDate ? (minimumDate ?? pickerDateToIso(new Date())) : '12:00';
  const pickerValue = toPicker(value || fallback);
  const limits = isDate
    ? {
        minimumDate: minimumDate ? isoToPickerDate(minimumDate) : undefined,
        maximumDate: maximumDate ? isoToPickerDate(maximumDate) : undefined,
      }
    : {};
  const shown = value ? (isDate ? formatDate(value) : formatTime(value)) : placeholder;

  function open() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: pickerValue,
        mode,
        is24Hour: false,
        ...limits,
        onValueChange: (event, picked) => picked && onChange(fromPicker(picked)),
      });
    } else {
      setDraft(pickerValue);
      setSheetOpen(true);
    }
  }

  function confirm() {
    if (draft) onChange(fromPicker(draft));
    setSheetOpen(false);
  }

  return (
    <View>
      <AppText variant="label">{label}</AppText>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? shown : 'not chosen'}`}
        accessibilityHint={error || hint || `Opens the ${mode} picker`}
        style={({ pressed }) => [styles.box, error && styles.boxError, pressed && styles.boxPressed]}
      >
        <Text style={[styles.value, !value && styles.placeholder]}>{shown}</Text>
        <Text style={styles.action}>{value ? 'Change' : 'Choose'}</Text>
      </Pressable>
      {hint ? <AppText variant="small" style={styles.message}>{hint}</AppText> : null}
      {error ? (
        <View style={styles.errorRow}>
          <AlertIcon size={16} color={colors.danger} />
          <AppText variant="small" style={styles.errorText}>
            {error}
          </AppText>
        </View>
      ) : null}

      {Platform.OS === 'ios' && (
        <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)} accessibilityLabel="Close picker" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing[4] }]}>
            <AppText variant="heading">{label}</AppText>
            {draft && (
              <DateTimePicker
                testID={`${mode}-picker`}
                value={draft}
                mode={mode}
                display={isDate ? 'inline' : 'spinner'}
                themeVariant={scheme}
                {...limits}
                onValueChange={(event, picked) => picked && setDraft(picked)}
                style={styles.picker}
              />
            )}
            <View style={styles.sheetButtons}>
              <Button variant="secondary" onPress={() => setSheetOpen(false)} style={styles.flex}>
                Cancel
              </Button>
              <Button onPress={confirm} style={styles.flex}>
                Done
              </Button>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: {
    marginTop: spacing[1] + 2,
    minHeight: layout.inputHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3] + 2,
    backgroundColor: colors.surface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
  },
  boxPressed: { backgroundColor: colors.surfaceMuted },
  boxError: { borderColor: colors.danger },
  value: { ...typography.body, color: colors.text, flex: 1 },
  placeholder: { color: colors.textMuted },
  action: { color: colors.link, fontWeight: fontWeight.semibold, fontSize: 14, marginLeft: spacing[2] },
  message: { marginTop: spacing[1] + 2 },
  errorRow: { flexDirection: 'row', gap: spacing[1] + 2, marginTop: spacing[1] + 2, alignItems: 'flex-start' },
  errorText: { flex: 1, color: colors.danger, fontWeight: fontWeight.medium },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing[5],
  },
  picker: { alignSelf: 'stretch', marginTop: spacing[2] },
  sheetButtons: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[3] },
  flex: { flex: 1 },
}));

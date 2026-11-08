// Drop area: a field showing the chosen area; tapping it opens a searchable
// list of Mumbai areas (shared/mumbaiLocations.js - the website's list).
// The backend accepts any area as the trip's destination, so a typed name
// that isn't on the list can be used too ("Use “Dadar”").
//   <DropAreaPicker value="Powai" onChange={setArea} error={...} />
import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from './AppText';
import { AlertIcon, CheckIcon, MapPinIcon, SearchIcon } from './icons';
import { POPULAR_DESTINATIONS } from '../shared/mumbaiLocations';
import { borderWidth, fontWeight, layout, makeStyles, radius, spacing, typography, useTheme } from '../theme';

// Matches from the start of any word: "and" finds "Andheri West", not "Bandra"
export function searchAreas(query, areas = POPULAR_DESTINATIONS) {
  const q = query.trim().toLowerCase();
  if (!q) return areas;
  return areas.filter((area) => {
    const name = area.toLowerCase();
    return name.startsWith(q) || name.includes(` ${q}`);
  });
}

export default function DropAreaPicker({ value, onChange, label = 'Drop area', error, hint, disabled = false }) {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const typed = query.trim().replace(/\s+/g, ' ');
  const results = searchAreas(typed);
  const exact = POPULAR_DESTINATIONS.some((a) => a.toLowerCase() === typed.toLowerCase());
  const rows = [...results.map((name) => ({ name, custom: false })), ...(typed.length >= 2 && !exact ? [{ name: typed, custom: true }] : [])];

  function show() {
    setQuery('');
    setOpen(true);
  }

  function pick(name) {
    onChange(name);
    setOpen(false);
  }

  return (
    <View>
      <AppText variant="label">{label}</AppText>
      <Pressable
        onPress={show}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || 'not chosen'}`}
        accessibilityHint={error || hint || 'Opens a searchable list of Mumbai areas'}
        accessibilityState={{ disabled }}
        testID="drop-area-field"
        style={({ pressed }) => [styles.box, error && styles.boxError, pressed && styles.boxPressed, disabled && styles.disabled]}
      >
        <MapPinIcon size={20} color={value ? colors.primaryIcon : colors.textMuted} />
        <View style={styles.flex}>
          <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
            {value || 'Choose your drop area'}
          </Text>
          {value ? <AppText variant="caption">Mumbai</AppText> : null}
        </View>
        <Text style={styles.change}>{value ? 'Change' : 'Choose'}</Text>
      </Pressable>
      {hint ? <AppText variant="small" style={styles.message}>{hint}</AppText> : null}
      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <AlertIcon size={16} color={colors.danger} />
          <AppText variant="small" style={styles.errorText}>
            {error}
          </AppText>
        </View>
      ) : null}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)} presentationStyle="pageSheet">
        <View style={[styles.sheet, { paddingTop: insets.top + spacing[3] }]}>
          <View style={styles.sheetHeader}>
            <AppText variant="heading" accessibilityRole="header">
              {label}
            </AppText>
            <Pressable onPress={() => setOpen(false)} accessibilityRole="button" hitSlop={8} style={styles.close}>
              <Text style={styles.change}>Cancel</Text>
            </Pressable>
          </View>
          <View style={styles.search}>
            <SearchIcon size={18} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search Mumbai areas"
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={scheme}
              accessibilityLabel="Search drop areas"
              autoFocus
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={() => rows.length === 1 && pick(rows[0].name)}
              style={styles.searchInput}
              testID="drop-area-search"
            />
          </View>
          <FlatList
            data={rows}
            keyExtractor={(row) => `${row.custom ? 'custom:' : ''}${row.name}`}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing[6] }}
            ListEmptyComponent={
              <AppText variant="small" style={styles.empty}>
                Type at least 2 letters to use an area that isn’t listed.
              </AppText>
            }
            renderItem={({ item, index }) => {
              const selected = !item.custom && item.name === value;
              return (
                <Pressable
                  onPress={() => pick(item.name)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={item.custom ? `Use ${item.name}` : `${item.name}, Mumbai`}
                  style={({ pressed }) => [styles.row, index > 0 && styles.divider, pressed && styles.rowPressed]}
                >
                  <View style={styles.flex}>
                    <Text style={[styles.rowText, selected && styles.rowSelected]}>
                      {item.custom ? `Use “${item.name}”` : item.name}
                    </Text>
                    <AppText variant="caption">{item.custom ? 'Not on the list - any Mumbai area is fine' : 'Mumbai'}</AppText>
                  </View>
                  {selected ? <CheckIcon size={18} color={colors.primaryIcon} /> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  box: {
    marginTop: spacing[1] + 2,
    minHeight: layout.inputHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[3] + 2,
    paddingVertical: spacing[2],
    backgroundColor: colors.surface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
  },
  boxPressed: { backgroundColor: colors.surfaceMuted },
  boxError: { borderColor: colors.danger },
  disabled: { opacity: 0.6 },
  value: { ...typography.body, color: colors.text },
  placeholder: { color: colors.textMuted },
  change: { color: colors.link, fontWeight: fontWeight.semibold, fontSize: 14 },
  message: { marginTop: spacing[1] + 2 },
  errorRow: { flexDirection: 'row', gap: spacing[1] + 2, marginTop: spacing[1] + 2, alignItems: 'flex-start' },
  errorText: { flex: 1, color: colors.danger, fontWeight: fontWeight.medium },
  sheet: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: layout.screenPadding },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: layout.minTouchTarget },
  close: { minHeight: layout.minTouchTarget, justifyContent: 'center' },
  search: {
    marginTop: spacing[2],
    marginBottom: spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    minHeight: layout.inputHeight,
    borderRadius: radius.lg,
    borderWidth: borderWidth.thick,
    borderColor: colors.primary,
  },
  searchInput: { flex: 1, ...typography.body, color: colors.text, paddingVertical: spacing[2] },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2] },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  rowText: { ...typography.body, color: colors.text },
  rowSelected: { color: colors.primarySoftText, fontWeight: fontWeight.semibold },
  empty: { paddingVertical: spacing[4] },
}));

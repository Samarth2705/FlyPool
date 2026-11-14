// Drop area: a field showing the chosen area; tapping it opens a searchable
// list of areas grouped as Mumbai / Navi Mumbai (shared/mumbaiLocations.js -
// the website's list).
//   Trip planning: <DropAreaPicker onChooseOther={...} otherSelected={...} />
//     adds an "Others" row - the screen then asks for the destination in a
//     text field (that text is saved, never "Others").
//   Flight verification (no onChooseOther): a typed name that isn't on the
//     list can be used directly ("Use “Versova”").
import { useState } from 'react';
import { Modal, Pressable, SectionList, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from './AppText';
import { AlertIcon, CheckIcon, MapPinIcon, SearchIcon } from './icons';
import { OTHERS, POPULAR_DESTINATIONS, regionOf, searchDestinationGroups } from '../shared/mumbaiLocations';
import { borderWidth, fontWeight, layout, makeStyles, radius, spacing, typography, useTheme } from '../theme';

// Matches from the start of any word: "and" finds "Andheri West", not "Bandra"
export function searchAreas(query) {
  return searchDestinationGroups(query).flatMap((g) => g.areas);
}

export default function DropAreaPicker({
  value,
  onChange,
  label = 'Drop area',
  error,
  hint,
  disabled = false,
  onChooseOther = null, // shows the "Others" row
  otherSelected = false, // "Others" is the current choice
  placeholder = 'Choose your drop area',
  testID = 'drop-area',
}) {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const typed = query.trim().replace(/\s+/g, ' ');
  const exact = POPULAR_DESTINATIONS.some((a) => a.toLowerCase() === typed.toLowerCase());
  const sections = searchDestinationGroups(typed).map((g) => ({ title: g.region, data: g.areas.map((name) => ({ name, region: g.region })) }));
  // (With onChooseOther, "Others" is a fixed row under the search box - always in view)
  if (!onChooseOther && typed.length >= 2 && !exact) {
    sections.push({ title: 'Not on the list', data: [{ name: typed, custom: true }] });
  }
  const rowCount = sections.reduce((n, s) => n + s.data.length, 0);
  const shownValue = otherSelected ? OTHERS : value;
  const region = otherSelected ? null : regionOf(value);

  function show() {
    setQuery('');
    setOpen(true);
  }

  function pick(row) {
    setOpen(false);
    if (row.other) onChooseOther();
    else onChange(row.name);
  }

  return (
    <View>
      <AppText variant="label">{label}</AppText>
      <Pressable
        onPress={show}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shownValue || 'not chosen'}`}
        accessibilityHint={error || hint || 'Opens a searchable list of Mumbai and Navi Mumbai areas'}
        accessibilityState={{ disabled }}
        testID={`${testID}-field`}
        style={({ pressed }) => [styles.box, error && styles.boxError, pressed && styles.boxPressed, disabled && styles.disabled]}
      >
        <MapPinIcon size={20} color={shownValue ? colors.primaryIcon : colors.textMuted} />
        <View style={styles.flex}>
          <Text style={[styles.value, !shownValue && styles.placeholder]} numberOfLines={1}>
            {shownValue || placeholder}
          </Text>
          {otherSelected ? <AppText variant="caption">Type your destination below</AppText> : null}
          {region ? <AppText variant="caption">{region}</AppText> : null}
        </View>
        <Text style={styles.change}>{shownValue ? 'Change' : 'Choose'}</Text>
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
              placeholder="Search Mumbai & Navi Mumbai areas"
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={scheme}
              accessibilityLabel={`Search ${label.toLowerCase()} areas`}
              autoFocus
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={() => rowCount === 1 && pick(sections[0].data[0])}
              style={styles.searchInput}
              testID={`${testID}-search`}
            />
          </View>
          {onChooseOther ? (
            <Pressable
              onPress={() => pick({ other: true })}
              accessibilityRole="button"
              accessibilityState={{ selected: otherSelected }}
              accessibilityLabel="Others, type your destination"
              testID={`${testID}-others`}
              style={({ pressed }) => [styles.row, styles.otherRow, pressed && styles.rowPressed]}
            >
              <View style={styles.flex}>
                <Text style={[styles.rowText, otherSelected && styles.rowSelected]}>{OTHERS}</Text>
                <AppText variant="caption">Not listed? Type your destination</AppText>
              </View>
              {otherSelected ? <CheckIcon size={18} color={colors.primaryIcon} /> : null}
            </Pressable>
          ) : null}
          <SectionList
            sections={sections}
            keyExtractor={(row) => `${row.custom ? 'custom' : row.region}:${row.name}`}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled={false}
            // ~40 short rows: render them all, so every group (and screen readers) can reach them at once
            initialNumToRender={60}
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing[6] }}
            ListEmptyComponent={
              <AppText variant="small" style={styles.empty}>
                {onChooseOther ? 'No listed area matches. Choose Others to type your destination.' : 'Type at least 2 letters to use an area that isn’t listed.'}
              </AppText>
            }
            renderSectionHeader={({ section }) => (
              <AppText variant="overline" style={styles.sectionHeader} accessibilityRole="header">
                {section.title}
              </AppText>
            )}
            renderItem={({ item, index }) => {
              const selected = !item.custom && !otherSelected && item.name === value;
              const caption = item.custom ? 'Not on the list - any area is fine' : item.region;
              return (
                <Pressable
                  onPress={() => pick(item)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={item.custom ? `Use ${item.name}` : `${item.name}, ${item.region}`}
                  style={({ pressed }) => [styles.row, index > 0 && styles.divider, pressed && styles.rowPressed]}
                >
                  <View style={styles.flex}>
                    <Text style={[styles.rowText, selected && styles.rowSelected]}>
                      {item.custom ? `Use “${item.name}”` : item.name}
                    </Text>
                    <AppText variant="caption">{caption}</AppText>
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
  sectionHeader: { paddingTop: spacing[4], paddingBottom: spacing[1], color: colors.textMuted },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2] },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  rowText: { ...typography.body, color: colors.text },
  rowSelected: { color: colors.primarySoftText, fontWeight: fontWeight.semibold },
  otherRow: { borderBottomWidth: 1, borderBottomColor: colors.border },
  empty: { paddingVertical: spacing[4] },
}));

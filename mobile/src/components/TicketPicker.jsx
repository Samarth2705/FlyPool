// Boarding pass / e-ticket picker: "Upload ticket" (PDF or image, via the
// system file picker) or "Take a photo" (camera), then a preview with
// Replace / Retake / Remove. The checks and conversions are in
// utils/ticketDocument.js.
//   <TicketPicker value={ticket} onChange={setTicket} error={errors.document} disabled={sending} />
// value: the prepared ticket or null. onChange gets a new ticket or null; the
// screen deletes the previous one's temporary copy.
import { useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, Text, View } from 'react-native';
import AppText from './AppText';
import { AlertIcon, CameraIcon, CheckIcon, FileIcon, UploadIcon } from './icons';
import { formatFileSize } from '../shared/documents';
import { MAX_DOCUMENT_BYTES, TicketError, pickTicketFile, takeTicketPhoto } from '../utils/ticketDocument';
import { fontWeight, layout, makeStyles, radius, spacing, useTheme } from '../theme';

const LIMIT_TEXT = `JPG, PNG, WebP or PDF · up to ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB`;

function Choice({ icon: Icon, title, subtitle, onPress, disabled, busy, testID }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      accessibilityState={{ disabled, busy }}
      testID={testID}
      style={({ pressed }) => [styles.choice, pressed && styles.choicePressed, disabled && styles.disabled]}
    >
      {busy ? <ActivityIndicator color={colors.primary} /> : <Icon size={26} color={colors.primaryIcon} />}
      <Text style={styles.choiceTitle}>{title}</Text>
      <AppText variant="caption" style={styles.center}>
        {subtitle}
      </AppText>
    </Pressable>
  );
}

function TextAction({ children, onPress, disabled, danger = false, testID }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      hitSlop={6}
      testID={testID}
      style={[styles.action, disabled && styles.disabled]}
    >
      <Text style={[styles.actionText, danger && styles.actionDanger]}>{children}</Text>
    </Pressable>
  );
}

export default function TicketPicker({ value, onChange, error, disabled = false }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [busy, setBusy] = useState(null); // 'file' | 'camera' while choosing / converting
  const [problem, setProblem] = useState(null); // { message, openSettings }

  async function choose(source) {
    if (busy) return;
    setBusy(source);
    setProblem(null);
    try {
      const ticket = source === 'camera' ? await takeTicketPhoto() : await pickTicketFile();
      if (ticket) onChange(ticket); // null: the passenger cancelled - keep what was there
    } catch (err) {
      if (err instanceof TicketError) {
        setProblem({ message: err.message, openSettings: err.code === 'CAMERA_DENIED' && err.canAskAgain === false });
      } else {
        setProblem({
          message:
            source === 'camera'
              ? 'The camera couldn’t be opened. Please try again, or upload a file instead.'
              : 'The file couldn’t be opened. Please try again.',
        });
      }
    } finally {
      setBusy(null);
    }
  }

  const shownError = problem?.message ?? error;
  const locked = disabled || Boolean(busy);

  return (
    <View>
      {value ? (
        <View style={[styles.selected, shownError && styles.selectedError]} testID="ticket-selected">
          {value.kind === 'image' ? (
            <Image
              source={{ uri: value.uri }}
              style={styles.preview}
              resizeMode="contain"
              accessible
              accessibilityLabel="Preview of your boarding pass"
              testID="ticket-preview"
            />
          ) : (
            <View style={styles.pdf} accessible accessibilityLabel="PDF document" testID="ticket-pdf">
              <FileIcon size={36} color={colors.primaryIcon} />
              <Text style={styles.pdfBadge}>PDF</Text>
            </View>
          )}
          <View style={styles.details}>
            <View style={styles.ready}>
              <CheckIcon size={14} color={colors.success} />
              <Text style={styles.readyText}>Ready to verify</Text>
            </View>
            <AppText variant="bodyStrong" numberOfLines={1} ellipsizeMode="middle" testID="ticket-name">
              {value.name}
            </AppText>
            <AppText variant="small" testID="ticket-info">
              {value.kind === 'pdf' ? 'PDF' : 'Image'} · {formatFileSize(value.size)}
              {value.compressed ? ' · made smaller for upload' : ''}
            </AppText>
            <View style={styles.actions}>
              <TextAction onPress={() => choose('file')} disabled={locked} testID="ticket-replace">
                Replace file
              </TextAction>
              <TextAction onPress={() => choose('camera')} disabled={locked} testID="ticket-retake">
                Retake photo
              </TextAction>
              <TextAction
                onPress={() => {
                  setProblem(null);
                  onChange(null);
                }}
                disabled={locked}
                danger
                testID="ticket-remove"
              >
                Remove
              </TextAction>
            </View>
            {busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <AppText variant="small">{busy === 'camera' ? 'Preparing your photo…' : 'Opening your file…'}</AppText>
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.choices}>
          <Choice
            icon={UploadIcon}
            title="Upload ticket"
            subtitle="PDF, or an image from your phone"
            onPress={() => choose('file')}
            disabled={locked}
            busy={busy === 'file'}
            testID="ticket-upload"
          />
          <Choice
            icon={CameraIcon}
            title="Take a photo"
            subtitle="Of your boarding pass or e-ticket"
            onPress={() => choose('camera')}
            disabled={locked}
            busy={busy === 'camera'}
            testID="ticket-camera"
          />
        </View>
      )}

      <AppText variant="caption" style={styles.limit}>
        {LIMIT_TEXT}. Large photos are made smaller automatically.
      </AppText>

      {shownError ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite" accessibilityRole="alert">
          <AlertIcon size={16} color={colors.danger} />
          <View style={styles.flex}>
            <AppText variant="small" style={styles.errorText} testID="ticket-error">
              {shownError}
            </AppText>
            {problem?.openSettings ? (
              <TextAction onPress={() => Linking.openSettings()} testID="open-settings">
                Open Settings
              </TextAction>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  choices: { flexDirection: 'row', gap: spacing[3] },
  choice: {
    flex: 1,
    minHeight: 128,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1] + 2,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[4],
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  choicePressed: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceTitle: { fontSize: 16, fontWeight: fontWeight.semibold, color: colors.text },
  disabled: { opacity: 0.5 },
  selected: {
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  selectedError: { borderColor: colors.danger },
  preview: { width: 96, height: 120, borderRadius: radius.md, backgroundColor: colors.ink },
  pdf: {
    width: 96,
    height: 120,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
  },
  pdfBadge: { fontSize: 12, fontWeight: fontWeight.bold, color: colors.primarySoftText, letterSpacing: 1 },
  details: { flex: 1, minWidth: 0, gap: 2 },
  ready: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  readyText: { fontSize: 12, fontWeight: fontWeight.semibold, color: colors.success },
  actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing[4], marginTop: spacing[1] },
  action: { minHeight: layout.minTouchTarget, justifyContent: 'center' },
  actionText: { color: colors.link, fontWeight: fontWeight.semibold, fontSize: 14 },
  actionDanger: { color: colors.danger },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  limit: { marginTop: spacing[2] },
  errorRow: { flexDirection: 'row', gap: spacing[1] + 2, marginTop: spacing[2], alignItems: 'flex-start' },
  errorText: { color: colors.danger, fontWeight: fontWeight.medium },
}));

// A scrolling screen that stays usable with the keyboard open: content moves
// up on iOS, Android resizes the window itself, and taps on buttons work
// while the keyboard is showing.
//   <FormScreen header={<AppHeader />}>...form...</FormScreen>
// onRefresh (optional) adds pull-to-refresh; refreshing shows its spinner.
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, makeStyles, spacing, useTheme } from '../theme';

export default function FormScreen({ header, children, footer, contentStyle, onRefresh, refreshing = false }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.page} testID="screen">
      {header}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flex}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} testID="pull-to-refresh" />
            ) : undefined
          }
          contentContainerStyle={[
            styles.content,
            { paddingTop: header ? spacing[5] : insets.top + spacing[6], paddingBottom: insets.bottom + spacing[8] },
            contentStyle,
          ]}
        >
          <View style={styles.inner}>{children}</View>
        </ScrollView>
        {footer}
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: layout.screenPadding },
  inner: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' },
}));

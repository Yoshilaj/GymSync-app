/**
 * The three-page pitch, between Welcome and the onboarding questions.
 *
 * Each page carries its own illustration, heading and body inside the paged
 * item, so the copy travels with the swipe instead of cross-fading against
 * it. Skip and the final CTA both land on pre-auth onboarding — the account
 * comes later, after the questions have earned it.
 */
import { useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthNavigator';
import { AppText, Button, PageDots, Screen } from '@/components/ui';
import { layout, makeStyles, radius, spacing, useTheme } from '@/theme';

type Nav = NativeStackNavigationProp<AuthStackParamList>;

interface Page {
  key: string;
  title: string;
  body: string;
  art: ImageSourcePropType;
}

const PAGES: Page[] = [
  {
    key: 'coach',
    title: 'A coach in your ear',
    body: 'Talk to it mid-set. It hears the rep, answers the question, and your hands never leave the bar.',
    art: require('../../../assets/intro/intro-coach.png'),
  },
  {
    key: 'plan',
    title: 'A plan that fits your week',
    body: 'Built from your goals, your body, and the equipment you actually have — not a generic template.',
    art: require('../../../assets/intro/intro-plan.png'),
  },
  {
    key: 'progress',
    title: 'A plan that learns from every rep',
    body: 'Every set becomes data. GymSync tunes your weights and reps week by week.',
    art: require('../../../assets/intro/intro-progress.png'),
  },
];

export function IntroScreen() {
  const nav = useNavigation<Nav>();
  const styles = useStyles();
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<Page>>(null);
  const [page, setPage] = useState(0);

  const isLast = page === PAGES.length - 1;
  const artHeight = height * 0.38;
  const toOnboarding = () => nav.navigate('Onboarding');

  const onNext = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isLast) {
      toOnboarding();
      return;
    }
    const next = page + 1;
    setPage(next);
    listRef.current?.scrollToIndex({ index: next, animated: true });
  };

  return (
    <Screen
      wash
      padded={false}
      tabBarClearance={false}
      footer={
        <View style={styles.footer}>
          {/* One row shape for every page: quiet Skip on the left (empty slot
              on the last page), a compact pill on the right. A full-width CTA
              here outweighed the whole screen. */}
          {isLast ? (
            // The closing CTA earns center stage — bigger than Next, but
            // still a contained pill, not a full-width bar.
            <Button
              title="Get started"
              variant="primary"
              size="lg"
              full={false}
              style={styles.getStarted}
              onPress={onNext}
            />
          ) : (
            <View style={styles.footerRow}>
              <Pressable
                onPress={toOnboarding}
                hitSlop={12}
                accessibilityRole="button"
                style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
              >
                <AppText variant="button" color="textSecondary">
                  Skip
                </AppText>
              </Pressable>
              <Button
                title="Next"
                variant="primary"
                size="md"
                full={false}
                style={styles.next}
                onPress={onNext}
              />
            </View>
          )}
        </View>
      }
    >
      <View style={styles.top}>
        <Pressable
          onPress={() => nav.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={PAGES}
        keyExtractor={(p) => p.key}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          if (idx !== page) {
            void Haptics.selectionAsync();
            setPage(idx);
          }
        }}
        renderItem={({ item }) => (
          <View style={[styles.page, { width }]}>
            <Image
              source={item.art}
              style={{ width: width - layout.SCREEN_H_PADDING * 2, height: artHeight }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            <View style={styles.dots}>
              <PageDots count={PAGES.length} index={page} />
            </View>
            {/* Fixed slots: headings run 1–2 lines and bodies 2–3, and without
                reserved height the centred block would jump as you swipe. */}
            <View style={styles.titleBox}>
              <AppText variant="h1" align="center">
                {item.title}
              </AppText>
            </View>
            <View style={styles.bodyBox}>
              <AppText variant="body" color="textSecondary" align="center">
                {item.body}
              </AppText>
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  top: {
    paddingHorizontal: layout.SCREEN_H_PADDING,
    paddingBottom: spacing.sm,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.bgSubtle,
  },
  // Distributed, not centered: art up top, copy mid, and the leftover space
  // pools at the bottom above the footer instead of squeezing everything
  // together in the middle.
  page: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: layout.SCREEN_H_PADDING,
  },
  dots: { marginTop: spacing.xxl },
  // Two lines of `h1` (34) and two of `body` (24). minHeight, not height, so
  // larger Dynamic Type grows the slot instead of clipping it.
  titleBox: {
    minHeight: 68,
    justifyContent: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  bodyBox: { minHeight: 48 },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  skip: {
    minHeight: 44,
    justifyContent: 'center',
    // Pulled in from the edge so the pair reads as one balanced row.
    paddingLeft: spacing.xl,
    paddingRight: spacing.lg,
  },
  next: { minWidth: 120 },
  getStarted: { alignSelf: 'center', minWidth: 220 },
  pressed: { opacity: 0.6 },
}));

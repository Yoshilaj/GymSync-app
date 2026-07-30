/**
 * What the selected tier gets you — capability rows, not a checklist.
 *
 * Each feature is a glyph in a soft well beside its name: the Apple
 * "What's New sheet" pattern, in this app's own well convention (ListRow's
 * 34pt / radius-10 / accentSoft / accentText). Five identical checkmarks said
 * "terms accepted"; five distinct glyphs say "five different capabilities."
 *
 * "Everything in Free" is the eyebrow rather than a sixth bullet. As a bullet
 * it competes with real features and buries the single most important
 * structural fact — that the tiers stack. It sits on the wells' left edge, so
 * the whole block — eyebrow, icons, labels — shares one outer margin.
 *
 * The list is height-pinned: every tier has exactly five features, so pinning
 * to the row grid means flipping tiers moves nothing on the page — the dial
 * effect the screen is built around.
 *
 * The `locked` tone renders the same rows for capabilities the selected tier
 * does NOT have. Same geometry, drained of accent: grey wells, secondary ink,
 * a rule above to mark where "yours" stops. It is the same component on
 * purpose — a locked row that didn't line up with the included ones would read
 * as a different kind of thing rather than the same thing withheld. Unpinned,
 * because a locked block is a fragment (three of five) rather than a tier.
 */
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Entering } from '@/components/ui';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import type { Feature } from '../catalog';

/**
 * Circular wells rather than ListRow's rounded squares. Five soft discs read
 * as a set of capabilities; five rounded rectangles read as rows in a table,
 * which is the look this screen has been trying to shed.
 */
const WELL = 34;
const ICON = 17;

/**
 * The gap *inside* a list — deliberately much tighter than the gap between
 * blocks (`spacing.xl` on the screen, 3× this).
 *
 * Rows this close read as one object with five parts; at the 16 they used to
 * sit at, each row floated alone and the list dissolved into five unrelated
 * lines drifting down the page. The whole page's rhythm is that ratio: tight
 * within a group, generous between groups, and nothing in between. It's also
 * what buys the vertical budget to fit the screen without scrolling.
 *
 * 8 against a 34pt well still leaves a 42pt pitch — comfortably past the 44pt
 * touch minimum's spirit for rows that aren't tappable, and close to a system
 * table row.
 */
const ROW_GAP = spacing.sm;

/** Five well-height rows, four gaps. Same for every tier — see header. */
const LIST_MIN_HEIGHT = 5 * WELL + 4 * ROW_GAP;

interface Props {
  /** Omitted on Free, which inherits nothing and so has nothing to frame. */
  eyebrow?: string | null;
  features: readonly Feature[];
  /** `locked` = what this tier withholds. See the header. */
  tone?: 'included' | 'locked';
}

export function FeatureList({ eyebrow, features, tone = 'included' }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const locked = tone === 'locked';

  return (
    <View style={locked ? styles.lockedWrap : styles.wrap}>
      {/* Reserved even on Free, which inherits nothing and so has no eyebrow
          to show. Without the empty row Free's icons would sit 40pt higher
          than Pro's and the list would jump every time the tier changed. */}
      <View style={locked ? undefined : styles.eyebrow}>
        {/* Secondary, so it frames the list instead of reading as a sixth
            item set in the same ink as the features themselves. On a locked
            block it drops to the small caps eyebrow: it's naming a boundary,
            not introducing a list, and it must not out-weigh the tier's own. */}
        {eyebrow ? (
          <AppText
            variant={locked ? 'label' : 'body'}
            color={locked ? 'textTertiary' : 'textSecondary'}
          >
            {eyebrow}
          </AppText>
        ) : null}
      </View>

      <View style={locked ? styles.lockedList : styles.list}>
        {features.map((f, i) => (
          <Entering key={f.label} index={i}>
            {/* One accessible element per row, so VoiceOver reads the feature
                as a single phrase. */}
            <View style={styles.row} accessible accessibilityRole="text">
              <View style={[styles.well, locked && styles.wellLocked]}>
                <Ionicons
                  name={f.icon}
                  size={ICON}
                  color={locked ? colors.textTertiary : colors.accentText}
                />
              </View>
              {/* Note beside the label, baseline-shared — a second line would
                  break the even row grid the pinning depends on. */}
              <View style={styles.text}>
                {/* Secondary, not tertiary: these have to stay readable to do
                    any persuading. Dimming them to placeholder ink would hide
                    the exact thing the block exists to show. */}
                <AppText variant="body" color={locked ? 'textSecondary' : 'textPrimary'}>
                  {f.label}
                </AppText>
                {f.note ? (
                  <AppText variant="caption" color="textTertiary">
                    {f.note}
                  </AppText>
                ) : null}
              </View>
            </View>
          </Entering>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  // No horizontal padding of its own: the block shares the screen gutter with
  // the tier tabs and the price cards, so every left edge on the page lines up.
  // The eyebrow belongs to the list it introduces, so it sits at the intra-group
  // distance — nearer its own rows than the block is to its neighbours.
  wrap: { gap: spacing.md },
  // A hairline above and air around it: the rule is the line between what you
  // have and what you don't, and it's the only chrome the block gets. The
  // padding above is the full inter-group gap; the gap below the label is the
  // intra-group one, so the rule reads as a boundary and the label as a header.
  lockedWrap: {
    gap: spacing.md,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
  },
  // One `body` line (24pt), held whether or not there's an eyebrow in it.
  eyebrow: { minHeight: 24, justifyContent: 'center' },
  list: { gap: ROW_GAP, minHeight: LIST_MIN_HEIGHT },
  // Unpinned — a fragment, not a tier. See the header.
  lockedList: { gap: ROW_GAP },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  well: {
    width: WELL,
    height: WELL,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.accentSoft,
  },
  // Drained of accent — the well is the fastest signal that a row is withheld,
  // and it says so without a padlock on every line.
  wellLocked: { backgroundColor: t.colors.bgSubtle },
  text: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
}));

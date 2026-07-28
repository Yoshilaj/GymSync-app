/**
 * The onboarding workhorse: a full-width, thumb-sized selectable row.
 *
 * Chips are for tags; life choices deserve a row you can read at arm's length
 * and hit without looking. Selected state is a solid accent fill (the same ink
 * the primary CTA uses) so the answer and the action read as one system.
 */
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from 'react-native-reanimated';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText } from './AppText';
import { AnimatedPressable } from './AnimatedPressable';
import { Entering } from './Entering';

export interface ChoiceOption<T extends string | number> {
  value: T;
  label: string;
  /** Plain-language example or consequence — what makes a row a row. */
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  emoji?: string;
}

interface RowProps {
  label: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  emoji?: string;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function ChoiceRow({
  label,
  description,
  icon,
  emoji,
  selected = false,
  onPress,
  style,
}: RowProps) {
  const { colors } = useTheme();
  const styles = useStyles();

  const labelColor = selected ? colors.textInverse : colors.textPrimary;
  const descColor = selected ? colors.textInverse : colors.textSecondary;
  const hasLeading = !!icon || !!emoji;

  return (
    <AnimatedPressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={description ? `${label}. ${description}` : label}
      style={[styles.row, selected ? styles.selected : styles.unselected, style]}
    >
      {hasLeading ? (
        <View style={[styles.leading, selected && styles.leadingSelected]}>
          {emoji ? (
            <AppText variant="bodyMedium">{emoji}</AppText>
          ) : (
            <Ionicons
              name={icon!}
              size={18}
              color={selected ? colors.textInverse : colors.textSecondary}
            />
          )}
        </View>
      ) : null}

      <View style={styles.text}>
        <AppText variant="bodyMedium" color={labelColor}>
          {label}
        </AppText>
        {!!description && (
          <AppText
            variant="caption"
            color={descColor}
            style={selected && styles.descOnAccent}
          >
            {description}
          </AppText>
        )}
      </View>
    </AnimatedPressable>
  );
}

interface ChoiceListProps<T extends string | number> {
  options: ChoiceOption<T>[];
  /**
   * A single value for single-select, an array for multi-select — the shape of
   * what you pass IS the mode, so there's no flag to get out of sync with it.
   */
  value: T | T[] | null;
  /** Always the row that was tapped; a multi-select caller owns the list. */
  onChange: (value: T) => void;
  /** Stagger the rows in on mount (skipped under Reduce Motion). */
  animate?: boolean;
}

/** A vertical stack of ChoiceRows. */
export function ChoiceList<T extends string | number>({
  options,
  value,
  onChange,
  animate = true,
}: ChoiceListProps<T>) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();

  return (
    <View style={styles.list}>
      {options.map((opt, i) => (
        <Entering key={String(opt.value)} index={i} enabled={animate && !reduceMotion}>
          <ChoiceRow
            label={opt.label}
            description={opt.description}
            icon={opt.icon}
            emoji={opt.emoji}
            selected={
              Array.isArray(value) ? value.includes(opt.value) : value === opt.value
            }
            onPress={() => onChange(opt.value)}
          />
        </Entering>
      ))}
    </View>
  );
}

interface ChoiceGridProps<T extends string | number> {
  options: ChoiceOption<T>[];
  /** Multi-select only — the grid is for "pick any that apply" sets. */
  value: T[];
  /** Always the cell that was tapped; the caller owns the list. */
  onChange: (value: T) => void;
  animate?: boolean;
}

/**
 * The compact sibling of ChoiceList: a two-column grid of selectable cells
 * for short-label sets (body areas, tags) where full rows would run long and
 * chips would read too light next to them.
 */
export function ChoiceGrid<T extends string | number>({
  options,
  value,
  onChange,
  animate = true,
}: ChoiceGridProps<T>) {
  const { colors } = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.grid}>
      {options.map((opt, i) => {
        const selected = value.includes(opt.value);
        return (
          // The plain wrapper owns the column layout; an animated wrapper as
          // the flex child would break the two-column distribution.
          <View key={String(opt.value)} style={styles.cellWrap}>
            <Entering index={i} enabled={animate}>
              <AnimatedPressable
                onPress={() => {
                  void Haptics.selectionAsync();
                  onChange(opt.value);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={opt.label}
                style={[
                  styles.cell,
                  selected ? styles.selected : styles.unselected,
                ]}
              >
                <AppText
                  variant="bodyMedium"
                  color={selected ? colors.textInverse : colors.textPrimary}
                >
                  {opt.label}
                </AppText>
              </AnimatedPressable>
            </Entering>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  list: { gap: spacing.sm },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cellWrap: { flexBasis: '48%', flexGrow: 1 },
  cell: {
    minHeight: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 68,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  unselected:
    t.scheme === 'dark'
      ? {
          backgroundColor: t.colors.bgSubtle,
          // Dark surfaces sit close together, so the row needs a hairline to
          // read as a distinct target — same trick Card uses for elevation.
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.colors.border,
        }
      : {
          // Rows live on the screen wash, where bgSubtle disappears — the
          // card language (white + shadow, no border) keeps them tappable.
          backgroundColor: t.colors.card,
          ...t.shadows.xs,
        },
  selected: { backgroundColor: t.colors.accent, ...t.shadows.sm },
  leading: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    // A step off the row surface in either scheme: a subtle well on the white
    // row in light, a lighter (elevated) circle on the bgSubtle row in dark.
    backgroundColor: t.scheme === 'dark' ? t.colors.card : t.colors.bgSubtle,
  },
  leadingSelected: { backgroundColor: t.colors.accentPressed },
  text: { flex: 1, gap: spacing.xxs },
  descOnAccent: { opacity: 0.85 },
}));

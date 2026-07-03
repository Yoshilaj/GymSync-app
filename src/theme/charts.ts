import { colors } from './colors';
import { font } from './typography';
import { palette } from './palette';
import { gradients } from './gradients';

/** Series + scaffold colors for react-native-gifted-charts. */
export const chartColors = {
  primary: palette.blue[500],
  secondary: palette.green[500],
  tertiary: palette.violet[500],
  hot: palette.orange[500],
  grid: palette.navy[200],
} as const;

const axisText = {
  color: colors.textSecondary,
  fontSize: 11,
  fontFamily: font.medium,
};

/**
 * Baseline props for a themed LineChart. Spread first, then override
 * per-chart: <LineChart {...defaultLineChartProps()} data={...} />
 */
export function defaultLineChartProps(tone: keyof typeof chartColors = 'primary') {
  const color = chartColors[tone];
  return {
    color,
    thickness: 3,
    curved: true,
    areaChart: true,
    startFillColor: gradients.chartFill[0],
    endFillColor: gradients.chartFill[1],
    startOpacity: 1,
    endOpacity: 0,
    hideDataPoints: true,
    yAxisColor: 'transparent',
    xAxisColor: chartColors.grid,
    rulesColor: chartColors.grid,
    rulesType: 'solid' as const,
    yAxisTextStyle: axisText,
    xAxisLabelTextStyle: axisText,
    noOfSections: 4,
    initialSpacing: 8,
  };
}

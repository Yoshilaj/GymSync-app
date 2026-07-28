/**
 * Concentric rings bleeding off a corner — the brand's ring language
 * (RestRing, the breathing coach orb) as flat decoration for brand-filled
 * chrome. Used by the auth header and the coach-reveal hero. Pure decoration,
 * so it's aria-hidden by omission and never intercepts touches.
 */
import { StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface Props {
  /** Stroke color — callers on the brand fill pass `colors.textInverse`. */
  color: string;
  /** Svg canvas size; rings are clipped by the parent's bounds. */
  width: number;
  height: number;
  /** Shared center of every ring; default bleeds off the top-left corner. */
  center?: { x: number; y: number };
  radii?: number[];
  strokeWidth?: number;
  strokeOpacity?: number;
}

export function RingsMotif({
  color,
  width,
  height,
  center = { x: 40, y: 10 },
  radii = [56, 104, 152, 200, 248],
  strokeWidth = 8,
  strokeOpacity = 0.1,
}: Props) {
  return (
    <Svg
      width={width}
      height={height}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      {radii.map((r) => (
        <Circle
          key={r}
          cx={center.x}
          cy={center.y}
          r={r}
          stroke={color}
          strokeOpacity={strokeOpacity}
          strokeWidth={strokeWidth}
          fill="none"
        />
      ))}
    </Svg>
  );
}

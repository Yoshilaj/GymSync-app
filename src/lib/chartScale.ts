/**
 * Adaptive y-axis window for gifted-charts.
 *
 * gifted-charts semantics (verified in gifted-charts-core): with `yAxisOffset`
 * set, `maxValue` is the SPAN above the offset — point height is
 * `(value − yAxisOffset) / maxValue` and label i reads `offset + i·step`.
 */
export interface ChartScale {
  yAxisOffset: number;
  /** Span above the offset (NOT the absolute top). */
  maxValue: number;
  noOfSections: number;
}

/** Smallest "nice" step (1/2/2.5/5 × 10^k) covering range/sections. */
function niceStep(range: number, sections: number): number {
  const raw = range / sections;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (raw <= m * mag) return m * mag;
  }
  return 10 * mag;
}

/**
 * Window the axis to [min − pad, max + pad], snapped to nice label steps.
 * Never dips below zero.
 */
export function chartScale(values: number[], pad: number, sections = 4): ChartScale {
  const lo = Math.max(0, Math.min(...values) - pad);
  const hi = Math.max(...values) + pad;
  const step = niceStep(Math.max(hi - lo, 1), sections);
  const bottom = Math.floor(lo / step) * step;
  const n = Math.max(1, Math.ceil((hi - bottom) / step));
  return { yAxisOffset: bottom, maxValue: n * step, noOfSections: n };
}

/** Shared chart chrome so every chart uses the same hairline grid, axes and tooltip. */
export const GRID_PROPS = { stroke: "var(--grid)", vertical: false } as const;
export const AXIS_PROPS = {
  stroke: "var(--axis)",
  tickLine: false,
  tick: { fill: "var(--ink-muted)" },
} as const;
export const CURSOR = { stroke: "var(--axis)", strokeWidth: 1 } as const;

/** Evenly spaced time ticks (epoch ms) between two instants. */
export function timeTicks(startMs: number, endMs: number, stepHours: number): number[] {
  const step = stepHours * 3_600_000;
  const first = Math.ceil(startMs / step) * step;
  const ticks: number[] = [];
  for (let t = first; t <= endMs; t += step) ticks.push(t);
  return ticks;
}

/** An MW axis that always includes zero and steps in round amounts (500 / 1k / 2k / 5k…). */
export function niceAxis(min: number, max: number, maxIntervals = 5): { domain: [number, number]; ticks: number[] } {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  const steps = [250, 500, 1_000, 2_000, 2_500, 5_000, 10_000];
  const step =
    steps.find((s) => Math.ceil(hi / s) - Math.floor(lo / s) <= maxIntervals) ?? steps[steps.length - 1];
  const domain: [number, number] = [Math.floor(lo / step) * step, Math.max(step, Math.ceil(hi / step) * step)];
  const ticks: number[] = [];
  for (let t = domain[0]; t <= domain[1]; t += step) ticks.push(t);
  return { domain, ticks };
}

/** Marker spec: r=4 dot with a 2px ring in the surface colour. */
export const dot = (color: string) => ({ r: 4, fill: color, stroke: "var(--surface)", strokeWidth: 2 });

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

/** A zero-based MW axis with round steps (2k / 5k) so ticks read cleanly. */
export function mwAxis(maxMW: number): { domain: [number, number]; ticks: number[] } {
  const step = maxMW > 12_000 ? 5_000 : 2_000;
  const top = Math.max(step, Math.ceil(maxMW / step) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return { domain: [0, top], ticks };
}

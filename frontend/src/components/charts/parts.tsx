import type { ReactNode } from "react";

export function LegendLine({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="legend__item">
      <span className="legend__line" style={{ color }} />
      {children}
    </span>
  );
}

export function LegendRect({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="legend__item">
      <span className="legend__rect" style={{ background: color }} />
      {children}
    </span>
  );
}

export function TooltipBox({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="tooltip">
      <div className="tooltip__title">{title}</div>
      {children}
    </div>
  );
}

export function TooltipRow({ color, label, value }: { color?: string; label: ReactNode; value: ReactNode }) {
  return (
    <div className="tooltip__row">
      <span>
        {color && <span className="legend__line" style={{ color }} />}
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  value?: number | [number, number];
}

/** Bar with a 4px rounded data end and a square baseline, for positive and negative values. */
export function DataEndBar({ x = 0, y = 0, width = 0, height = 0, fill, value }: BarShapeProps) {
  if (!width || !height) return null;
  const top = Math.min(y, y + height);
  const h = Math.abs(height);
  const negative = (Array.isArray(value) ? value[1] - value[0] : (value ?? 0)) < 0;
  const r = Math.min(4, width / 2, h);
  const d = negative
    ? `M${x},${top} h${width} v${h - r} q0,${r} ${-r},${r} h${-(width - 2 * r)} q${-r},0 ${-r},${-r} Z`
    : `M${x},${top + h} v${-(h - r)} q0,${-r} ${r},${-r} h${width - 2 * r} q${r},0 ${r},${r} v${h - r} Z`;
  return <path d={d} fill={fill} />;
}

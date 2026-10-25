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

import type { ReactNode } from "react";

interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Card({ title, subtitle, actions, className = "", children }: CardProps) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card__head">
          <div>
            {title && <h2 className="card__title">{title}</h2>}
            {subtitle && <div className="card__subtitle">{subtitle}</div>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

interface KpiProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  hero?: boolean;
}

export function Kpi({ label, value, hint, hero = false }: KpiProps) {
  return (
    <div className={`card kpi ${hero ? "kpi--hero" : ""}`}>
      <div className="kpi__label">{label}</div>
      <div className="kpi__value">{value}</div>
      {hint && <div className="kpi__hint">{hint}</div>}
    </div>
  );
}

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

import { api } from "../api/client";
import type { Series } from "../api/types";
import { useAppContext } from "../AppContext";
import { Card, Kpi } from "../components/Card";
import { AXIS_PROPS, CURSOR, GRID_PROPS, niceAxis, timeTicks } from "../components/charts/config";
import { LegendLine, TooltipBox, TooltipRow } from "../components/charts/parts";
import { ErrorState, Loading } from "../components/States";
import {
  addDays,
  formatMW,
  formatPct,
  formatSignedMW,
  shortDay,
  tickMW,
  ukDateTime,
  ukMidnightIso,
} from "../lib/format";
import { useApi } from "../lib/useApi";
import { useDebounced } from "../lib/useDebounced";

const HORIZON_PRESETS = [0, 4, 12, 24, 36, 48];

interface Row {
  t: number;
  forecast?: number;
  actual?: number;
  publish?: string;
}

function ExplorerTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Row;
  return (
    <TooltipBox title={ukDateTime(new Date(row.t).toISOString())}>
      {row.forecast !== undefined && (
        <TooltipRow color="var(--series-forecast)" label="Forecast" value={formatMW(row.forecast)} />
      )}
      {row.actual !== undefined && <TooltipRow color="var(--series-actual)" label="Actual" value={formatMW(row.actual)} />}
      {row.publish && <TooltipRow label="Published" value={ukDateTime(row.publish)} />}
    </TooltipBox>
  );
}

export function ExplorerPage() {
  const { meta } = useAppContext();
  const firstDay = addDays(meta.delivery_days[0], -1);
  const lastDay = meta.delivery_days.at(-1)!;
  const [from, setFrom] = useState(addDays(lastDay, -6));
  const [to, setTo] = useState(lastDay);
  const [horizon, setHorizon] = useState(24);
  const debouncedHorizon = useDebounced(horizon, 250);

  const valid = from <= to;
  const start = ukMidnightIso(from);
  const end = ukMidnightIso(addDays(to, 1));
  const series = useApi(`series:${start}:${end}:${debouncedHorizon}`, (signal) =>
    valid ? api.series(debouncedHorizon, start, end, signal) : Promise.reject(new Error("Pick a start date before the end date")),
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Explorer</h1>
          <p>
            Compare actual wind with the forecast made a fixed time ahead. For every hour, the forecast shown is the
            latest one published at least <strong>{horizon} h</strong> before it.
          </p>
        </div>
      </div>

      <div className="filters">
        <div className="field">
          <label htmlFor="from">From (UK)</label>
          <input id="from" type="date" min={firstDay} max={lastDay} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="to">To (UK, inclusive)</label>
          <input id="to" type="date" min={firstDay} max={lastDay} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="horizon">
            Forecast horizon: <output htmlFor="horizon">{horizon} h</output>
          </label>
          <input
            id="horizon"
            type="range"
            min={0}
            max={48}
            step={1}
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <span id="horizon-presets">Presets</span>
          <div className="segmented" role="group" aria-labelledby="horizon-presets">
            {HORIZON_PRESETS.map((h) => (
              <button key={h} type="button" aria-pressed={horizon === h} onClick={() => setHorizon(h)}>
                {h} h
              </button>
            ))}
          </div>
        </div>
      </div>

      {series.error && <ErrorState error={series.error} />}
      {!series.data && !series.error && <Loading />}
      {series.data && !series.error && <SeriesView series={series.data} stale={series.loading} />}
    </>
  );
}

function SeriesView({ series, stale }: { series: Series; stale: boolean }) {
  const rows = useMemo(() => {
    const byTime = new Map<number, Row>();
    const row = (iso: string) => {
      const t = Date.parse(iso);
      if (!byTime.has(t)) byTime.set(t, { t });
      return byTime.get(t)!;
    };
    for (const p of series.points) Object.assign(row(p.start_time), { forecast: p.forecast_mw, publish: p.publish_time });
    for (const a of series.actuals_half_hourly) row(a.start_time).actual = a.actual_mw;
    return [...byTime.values()].sort((a, b) => a.t - b.t);
  }, [series]);

  const startMs = Date.parse(series.window.start);
  const endMs = Date.parse(series.window.end);
  const days = (endMs - startMs) / 86_400_000;
  const ticks = timeTicks(startMs, endMs, days <= 3 ? 6 : days <= 10 ? 24 : 72);
  const y = niceAxis(0, Math.max(0, ...rows.map((r) => Math.max(r.forecast ?? 0, r.actual ?? 0))));
  const { summary } = series;
  const tickLabel = (t: number) => {
    const iso = new Date(t).toISOString();
    return days <= 3 ? ukDateTime(iso).split(", ")[1] : shortDay(iso.slice(0, 10));
  };

  return (
    <div className={`stack ${stale ? "is-stale" : ""}`}>
      <div className="grid grid--kpis">
        <Kpi hero label="Mean absolute error" value={formatMW(summary.mae_mw)} hint={`${formatPct(summary.nmae_pct)} of mean actual`} />
        <Kpi label="Bias" value={formatSignedMW(summary.bias_mw)} hint="Positive = forecast too high" />
        <Kpi label="RMSE" value={formatMW(summary.rmse_mw)} />
        <Kpi label="Hours compared" value={summary.hours.toLocaleString("en-GB")} hint="Hourly forecast vs mean of two half-hours" />
      </div>
      <Card title={`Actual vs forecast made ≥ ${series.horizon_h} h ahead`} subtitle="National wind, MW · UK time">
        <div className="chart">
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                {...AXIS_PROPS}
                dataKey="t"
                type="number"
                scale="time"
                domain={[startMs, endMs]}
                ticks={ticks}
                tickFormatter={tickLabel}
              />
              <YAxis {...AXIS_PROPS} width={44} tickFormatter={tickMW} domain={y.domain} ticks={y.ticks} />
              <Tooltip content={<ExplorerTooltip />} cursor={CURSOR} />
              <Line dataKey="forecast" stroke="var(--series-forecast)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              <Line dataKey="actual" stroke="var(--series-actual)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="legend">
          <LegendLine color="var(--series-forecast)">Forecast (hourly)</LegendLine>
          <LegendLine color="var(--series-actual)">Actual (half-hourly)</LegendLine>
        </div>
      </Card>
    </div>
  );
}

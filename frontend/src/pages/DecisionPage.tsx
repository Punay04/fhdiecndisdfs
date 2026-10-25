import { useMemo } from "react";
import { useSearchParams } from "react-router";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

import { api } from "../api/client";
import type { Decision } from "../api/types";
import { useAppContext } from "../AppContext";
import { Card, Kpi } from "../components/Card";
import { AXIS_PROPS, CURSOR, GRID_PROPS, niceAxis, timeTicks } from "../components/charts/config";
import { LegendLine, LegendRect, TooltipBox, TooltipRow } from "../components/charts/parts";
import { GateSelect } from "../components/GateSelect";
import { ErrorState, Loading } from "../components/States";
import {
  formatGWh,
  formatMW,
  formatPct,
  formatSignedMW,
  longDay,
  shortDay,
  tickMW,
  ukDateTime,
  ukTime,
} from "../lib/format";
import { useApi } from "../lib/useApi";

interface ChartRow {
  t: number;
  forecast?: number;
  band?: [number, number];
  actual?: number;
}

function buildChartRows(decision: Decision): ChartRow[] {
  const rows = new Map<number, ChartRow>();
  const row = (iso: string) => {
    const t = Date.parse(iso);
    if (!rows.has(t)) rows.set(t, { t });
    return rows.get(t)!;
  };
  for (const h of decision.hours) {
    const r = row(h.start_time);
    r.forecast = h.forecast_mw;
    r.band = [h.firm_mw, h.upper_mw];
  }
  for (const a of decision.actuals_half_hourly) row(a.start_time).actual = a.actual_mw;
  return [...rows.values()].sort((a, b) => a.t - b.t);
}

function minutesBetween(fromIso: string, toIso: string): string {
  const minutes = Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m.toString().padStart(2, "0")} min` : `${m} min`;
}

function ForecastTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as ChartRow;
  return (
    <TooltipBox title={ukTime(new Date(row.t).toISOString())}>
      {row.forecast !== undefined && (
        <TooltipRow color="var(--series-forecast)" label="Forecast" value={formatMW(row.forecast)} />
      )}
      {row.band && (
        <TooltipRow label="P10 – P90" value={`${tickMW(Math.round(row.band[0]))} – ${tickMW(Math.round(row.band[1]))}`} />
      )}
      {row.actual !== undefined && (
        <TooltipRow color="var(--series-actual)" label="Actual" value={formatMW(row.actual)} />
      )}
    </TooltipBox>
  );
}

export function DecisionPage() {
  const { meta, gate } = useAppContext();
  const [params, setParams] = useSearchParams();
  const days = meta.delivery_days;
  const day = days.includes(params.get("day") ?? "") ? params.get("day")! : days[0];
  const dayIndex = days.indexOf(day);
  const setDay = (value: string) => setParams({ day: value }, { replace: true });

  const { data, error, loading } = useApi(`decision:${day}:${gate}`, (signal) => api.decision(day, gate, signal));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Day-ahead decision</h1>
          <p>
            The wind forecast the desk had in hand at auction gate closure, with the range it has historically landed
            in. Use it to size how much power to procure beyond wind.
          </p>
        </div>
      </div>

      <div className="filters">
        <div className="field">
          <label htmlFor="day">Delivery day</label>
          <div className="day-stepper">
            <button
              type="button"
              className="icon-btn"
              aria-label="Previous day"
              disabled={dayIndex <= 0}
              onClick={() => setDay(days[dayIndex - 1])}
            >
              ‹
            </button>
            <select id="day" value={day} onChange={(e) => setDay(e.target.value)}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {longDay(d)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icon-btn"
              aria-label="Next day"
              disabled={dayIndex >= days.length - 1}
              onClick={() => setDay(days[dayIndex + 1])}
            >
              ›
            </button>
          </div>
        </div>
        <GateSelect />
      </div>

      {error && <ErrorState error={error} />}
      {!data && !error && <Loading />}
      {data && <DecisionView decision={data} stale={loading} />}
    </>
  );
}

function DecisionView({ decision, stale }: { decision: Decision; stale: boolean }) {
  const rows = useMemo(() => buildChartRows(decision), [decision]);
  const { totals, band, accuracy } = decision;
  const usedPublish = decision.publish_times_used.at(-1)!;
  const nextPublish = decision.vintages
    .map((v) => v.publish_time)
    .filter((p) => p > decision.decision_time)
    .sort()[0];
  const startMs = Date.parse(decision.window.start);
  const endMs = Date.parse(decision.window.end);
  const ticks = timeTicks(startMs, endMs - 1, 3);
  const actualDelta =
    totals.actual_mwh !== null ? ((totals.actual_mwh - totals.forecast_mwh) / totals.forecast_mwh) * 100 : null;

  const yAxis = niceAxis(
    0,
    Math.max(...decision.hours.map((h) => h.upper_mw), ...decision.actuals_half_hourly.map((a) => a.actual_mw)),
  );

  return (
    <div className={`stack ${stale ? "is-stale" : ""}`}>
      <div className="callout">
        Bids for <strong>{longDay(decision.delivery_day)}</strong> (delivery {ukDateTime(decision.window.start)} →{" "}
        {ukDateTime(decision.window.end)}) close at <strong>{ukDateTime(decision.decision_time)}</strong>. The latest
        forecast available was published <strong>{ukDateTime(usedPublish)}</strong>,{" "}
        {minutesBetween(usedPublish, decision.decision_time)} before the gate.
        {nextPublish && (
          <>
            {" "}
            The next one landed at {ukTime(nextPublish)}, {minutesBetween(decision.decision_time, nextPublish)} after
            it.
          </>
        )}
      </div>

      <div className="grid grid--kpis">
        <Kpi
          hero
          label="Firm wind (P10)"
          value={formatGWh(totals.firm_mwh)}
          hint={`Delivered in 9 of 10 hours historically · forecast × ${band.p10.toFixed(2)}`}
        />
        <Kpi label="Forecast wind energy" value={formatGWh(totals.forecast_mwh)} hint={`Peak ${formatMW(totals.peak_forecast_mw)} · low ${formatMW(totals.trough_forecast_mw)}`} />
        <Kpi
          label="Expected outturn (P50)"
          value={formatGWh(totals.expected_mwh)}
          hint={`Typical January shortfall · forecast × ${band.p50.toFixed(2)}`}
        />
        <Kpi
          label="Actual outturn (backtest)"
          value={formatGWh(totals.actual_mwh)}
          hint={
            actualDelta !== null
              ? `${actualDelta >= 0 ? "+" : "−"}${formatPct(Math.abs(actualDelta))} vs forecast · MAE ${formatMW(accuracy.mae_mw)}`
              : "Not yet settled"
          }
        />
      </div>

      <Card
        title="Wind generation forecast at gate closure vs actual"
        subtitle={`National wind, MW · UK time · forecast published ${ukDateTime(usedPublish)}`}
      >
        <div className="chart">
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                {...AXIS_PROPS}
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                ticks={ticks}
                tickFormatter={(t: number) => ukTime(new Date(t).toISOString())}
              />
              <YAxis {...AXIS_PROPS} width={44} tickFormatter={tickMW} domain={yAxis.domain} ticks={yAxis.ticks} />
              <Tooltip content={<ForecastTooltip />} cursor={CURSOR} />
              <Area
                dataKey="band"
                stroke="none"
                fill="var(--series-forecast-wash)"
                connectNulls
                isAnimationActive={false}
                activeDot={false}
              />
              <Line
                dataKey="forecast"
                stroke="var(--series-forecast)"
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                dataKey="actual"
                stroke="var(--series-actual)"
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="legend">
          <LegendLine color="var(--series-forecast)">Forecast at gate closure</LegendLine>
          <LegendRect color="var(--series-forecast-wash)">
            P10–P90 range (forecast × {band.p10.toFixed(2)} – {band.p90.toFixed(2)})
          </LegendRect>
          <LegendLine color="var(--series-actual)">Actual outturn (half-hourly)</LegendLine>
        </div>
      </Card>

      <div className="grid grid--2">
        <VintagesCard decision={decision} />
        <Card title="Hourly figures" subtitle="Table view of the chart · MW">
          <HourlyTable decision={decision} />
        </Card>
      </div>
    </div>
  );
}

function VintagesCard({ decision }: { decision: Decision }) {
  const { rows, keys } = useMemo(() => {
    const byTime = new Map<number, Record<string, number>>();
    const keys = decision.vintages.map((v) => ({ key: v.publish_time, used: v.used }));
    for (const v of decision.vintages) {
      for (const p of v.points) {
        const t = Date.parse(p.start_time);
        const row = byTime.get(t) ?? { t };
        row[v.publish_time] = p.forecast_mw;
        byTime.set(t, row);
      }
    }
    for (const h of decision.hours) {
      const row = byTime.get(Date.parse(h.start_time));
      if (row && h.actual_mw !== null) row.actual = h.actual_mw;
    }
    return { rows: [...byTime.values()].sort((a, b) => a.t - b.t), keys };
  }, [decision]);

  const startMs = Date.parse(decision.window.start);
  const ticks = timeTicks(startMs, Date.parse(decision.window.end) - 1, 6);
  const yAxis = niceAxis(
    0,
    Math.max(...decision.vintages.flatMap((v) => v.points.map((p) => p.forecast_mw)), ...rows.map((r) => r.actual ?? 0)),
  );

  return (
    <Card
      title="How this day’s forecast evolved"
      subtitle={`Every publish that covered ${shortDay(decision.delivery_day)} · grey = publishes not usable or superseded`}
    >
      <div className="chart chart--short">
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              {...AXIS_PROPS}
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              tickFormatter={(t: number) => ukTime(new Date(t).toISOString())}
            />
            <YAxis {...AXIS_PROPS} width={44} tickFormatter={tickMW} domain={yAxis.domain} ticks={yAxis.ticks} />
            <Tooltip
              cursor={CURSOR}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Record<string, number>;
                return (
                  <TooltipBox title={ukTime(new Date(row.t).toISOString())}>
                    {keys.map(({ key, used }) =>
                      row[key] !== undefined ? (
                        <TooltipRow
                          key={key}
                          color={used ? "var(--series-forecast)" : "var(--series-vintage)"}
                          label={`Published ${ukDateTime(key)}`}
                          value={formatMW(row[key])}
                        />
                      ) : null,
                    )}
                    {row.actual !== undefined && (
                      <TooltipRow color="var(--series-actual)" label="Actual (hourly)" value={formatMW(row.actual)} />
                    )}
                  </TooltipBox>
                );
              }}
            />
            {keys
              .filter((k) => !k.used)
              .map(({ key }) => (
                <Line
                  key={key}
                  dataKey={key}
                  stroke="var(--series-vintage)"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            {keys
              .filter((k) => k.used)
              .map(({ key }) => (
                <Line
                  key={key}
                  dataKey={key}
                  stroke="var(--series-forecast)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            <Line dataKey="actual" stroke="var(--series-actual)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="legend">
        <LegendLine color="var(--series-forecast)">Forecast used at the gate</LegendLine>
        <LegendLine color="var(--series-vintage)">Other publishes</LegendLine>
        <LegendLine color="var(--series-actual)">Actual (hourly mean)</LegendLine>
      </div>
    </Card>
  );
}

function HourlyTable({ decision }: { decision: Decision }) {
  return (
    <div className="table-wrap" style={{ maxHeight: 300 }}>
      <table>
        <thead>
          <tr>
            <th>Hour</th>
            <th>Forecast</th>
            <th>Firm P10</th>
            <th>P90</th>
            <th>Actual</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {decision.hours.map((h) => (
            <tr key={h.start_time}>
              <td>{ukTime(h.start_time)}</td>
              <td>{Math.round(h.forecast_mw).toLocaleString("en-GB")}</td>
              <td>{Math.round(h.firm_mw).toLocaleString("en-GB")}</td>
              <td>{Math.round(h.upper_mw).toLocaleString("en-GB")}</td>
              <td>{h.actual_mw === null ? "–" : Math.round(h.actual_mw).toLocaleString("en-GB")}</td>
              <td>{formatSignedMW(h.error_mw).replace(" MW", "")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

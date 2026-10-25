import { Link } from "react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "../api/client";
import type { Accuracy, HorizonRow } from "../api/types";
import { useAppContext } from "../AppContext";
import { Card, Kpi } from "../components/Card";
import { AXIS_PROPS, CURSOR, GRID_PROPS, dot, niceAxis } from "../components/charts/config";
import { DataEndBar, LegendLine, LegendRect, TooltipBox, TooltipRow } from "../components/charts/parts";
import { GateSelect } from "../components/GateSelect";
import { ErrorState, Loading } from "../components/States";
import { formatGWh, formatMW, formatPct, formatSignedGW, formatSignedMW, shortDay, tickMW } from "../lib/format";
import { useApi } from "../lib/useApi";

const OVER = "var(--diverge-over)";
const UNDER = "var(--diverge-under)";
const MAE = "var(--series-mae)";
const signColor = (mw: number) => (mw >= 0 ? OVER : UNDER);
const BAR_CURSOR = { fill: "var(--accent-wash)" };

export function AccuracyPage() {
  const { gate } = useAppContext();
  const accuracy = useApi(`accuracy:${gate}`, (signal) => api.accuracy(gate, signal));
  const horizon = useApi("horizon", api.horizon);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Forecast accuracy</h1>
          <p>
            How far the forecast available at gate closure landed from actual wind generation, across every delivery
            hour of the January 2026 pilot. Error = forecast − actual, so positive means wind was over-forecast and
            the desk would have been short.
          </p>
        </div>
      </div>
      <div className="filters">
        <GateSelect />
      </div>
      {accuracy.error && <ErrorState error={accuracy.error} />}
      {!accuracy.data && !accuracy.error && <Loading />}
      {accuracy.data && (
        <AccuracyView accuracy={accuracy.data} horizon={horizon.data} stale={accuracy.loading} />
      )}
    </>
  );
}

function AccuracyView({ accuracy, horizon, stale }: { accuracy: Accuracy; horizon?: HorizonRow[]; stale: boolean }) {
  const { summary, bias_adjusted: adjusted } = accuracy;
  const improvement =
    adjusted.baseline.mae_mw && adjusted.adjusted.mae_mw
      ? (1 - adjusted.adjusted.mae_mw / adjusted.baseline.mae_mw) * 100
      : null;
  const overHours = accuracy.histogram.filter((b) => b.from_mw >= 0).reduce((n, b) => n + b.hours, 0);

  return (
    <div className={`stack ${stale ? "is-stale" : ""}`}>
      <div className="callout">
        Across {summary.hours} hours the forecast <strong>over-stated wind by {formatMW(summary.bias_mw)}</strong> on
        average, and was too high in {formatPct((100 * overHours) / summary.hours, 0)} of hours. The error is mostly
        a steady bias rather than noise: correcting each day by the previous week’s settled bias cuts the typical
        error by <strong>{formatPct(improvement, 0)}</strong>.
      </div>

      <div className="grid grid--kpis">
        <Kpi
          hero
          label="Mean absolute error"
          value={formatMW(summary.mae_mw)}
          hint={`${formatPct(summary.nmae_pct)} of mean actual wind (${formatMW(summary.mean_actual_mw)})`}
        />
        <Kpi label="Bias (mean error)" value={formatSignedMW(summary.bias_mw)} hint="Positive = forecast too high" />
        <Kpi label="RMSE" value={formatMW(summary.rmse_mw)} hint="Penalises large misses" />
        <Kpi
          label="P10 – P90 error"
          value={`${formatSignedGW(summary.error_p10_mw).replace(" GW", "")} to ${formatSignedGW(summary.error_p90_mw).replace(" GW", "")}`}
          hint="GW · 80% of hourly errors fall in this range"
        />
        <Kpi
          label="MAE after bias adjustment"
          value={formatMW(adjusted.adjusted.mae_mw)}
          hint={`vs ${formatMW(adjusted.baseline.mae_mw)} unadjusted over the same ${adjusted.adjusted.hours} h`}
        />
      </div>

      <DailyBiasCard accuracy={accuracy} />

      <div className="grid grid--2">
        <LevelCard accuracy={accuracy} />
        <HorizonCard horizon={horizon} />
      </div>

      <div className="grid grid--2">
        <HourOfDayCard accuracy={accuracy} />
        <HistogramCard accuracy={accuracy} />
      </div>

      <div className="grid grid--2">
        <GateComparisonCard accuracy={accuracy} />
        <WorstDaysCard accuracy={accuracy} />
      </div>
    </div>
  );
}

function DailyBiasCard({ accuracy }: { accuracy: Accuracy }) {
  const rows = accuracy.daily;
  const y = niceAxis(Math.min(...rows.map((r) => r.bias_mw)), Math.max(...rows.map((r) => r.bias_mw)));
  return (
    <Card
      title="Daily forecast bias"
      subtitle="Mean error per delivery day, MW · red = wind over-forecast (short), blue = under-forecast (long)"
    >
      <div className="chart chart--short">
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis {...AXIS_PROPS} dataKey="delivery_day" tickFormatter={shortDay} interval="preserveStartEnd" minTickGap={24} />
            <YAxis {...AXIS_PROPS} width={44} tickFormatter={tickMW} domain={y.domain} ticks={y.ticks} />
            <ReferenceLine y={0} stroke="var(--axis)" />
            <Tooltip
              cursor={BAR_CURSOR}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Accuracy["daily"][number];
                return (
                  <TooltipBox title={shortDay(row.delivery_day)}>
                    <TooltipRow color={signColor(row.bias_mw)} label="Bias" value={formatSignedMW(row.bias_mw)} />
                    <TooltipRow label="MAE" value={formatMW(row.mae_mw)} />
                    <TooltipRow label="Forecast" value={formatGWh(row.forecast_mwh)} />
                    <TooltipRow label="Actual" value={formatGWh(row.actual_mwh)} />
                  </TooltipBox>
                );
              }}
            />
            <Bar dataKey="bias_mw" maxBarSize={24} shape={<DataEndBar />} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.delivery_day} fill={signColor(r.bias_mw)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="legend">
        <LegendRect color={OVER}>Over-forecast</LegendRect>
        <LegendRect color={UNDER}>Under-forecast</LegendRect>
      </div>
    </Card>
  );
}

function LevelCard({ accuracy }: { accuracy: Accuracy }) {
  const rows = accuracy.by_level.map((r) => ({
    ...r,
    label: r.to_mw === null ? `${tickMW(r.from_mw)}+` : `${tickMW(r.from_mw)}–${tickMW(r.to_mw)}`,
  }));
  const top = rows.at(-1);
  const y = niceAxis(Math.min(...rows.map((r) => r.bias_mw)), Math.max(...rows.map((r) => r.bias_mw)));
  return (
    <Card title="Bias grows with the forecast" subtitle="Mean error by forecast level, MW">
      <div className="chart chart--short">
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis {...AXIS_PROPS} dataKey="label" />
            <YAxis {...AXIS_PROPS} width={44} tickFormatter={tickMW} domain={y.domain} ticks={y.ticks} />
            <ReferenceLine y={0} stroke="var(--axis)" />
            <Tooltip
              cursor={BAR_CURSOR}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as (typeof rows)[number];
                return (
                  <TooltipBox title={`Forecast ${row.label} MW`}>
                    <TooltipRow color={signColor(row.bias_mw)} label="Bias" value={formatSignedMW(row.bias_mw)} />
                    <TooltipRow label="MAE" value={formatMW(row.mae_mw)} />
                    <TooltipRow label="Hours" value={row.hours} />
                  </TooltipBox>
                );
              }}
            />
            <Bar dataKey="bias_mw" maxBarSize={24} shape={<DataEndBar />} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.label} fill={signColor(r.bias_mw)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {top && (
        <p className="insight">
          When the forecast was above {tickMW(top.from_mw)} MW, actual wind came in{" "}
          <strong>{formatMW(top.bias_mw)} lower</strong> on average ({top.hours} h). Treat very high forecasts with the
          most caution.
        </p>
      )}
    </Card>
  );
}

function HorizonCard({ horizon }: { horizon?: HorizonRow[] }) {
  const y = niceAxis(0, Math.max(0, ...(horizon ?? []).map((r) => r.mae_mw ?? 0)));
  return (
    <Card title="Error vs forecast lead time" subtitle="All pilot hours, latest forecast at least N hours ahead · MW">
      {!horizon ? (
        <Loading />
      ) : (
        <>
          <div className="chart chart--short">
            <ResponsiveContainer>
              <LineChart data={horizon} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis
                  {...AXIS_PROPS}
                  dataKey="horizon_h"
                  type="number"
                  domain={[0, 48]}
                  ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48]}
                  tickFormatter={(h: number) => `${h}h`}
                />
                <YAxis {...AXIS_PROPS} width={44} tickFormatter={tickMW} domain={y.domain} ticks={y.ticks} />
                <ReferenceArea x1={13.5} x2={38.5} fill="var(--accent-wash)" stroke="none" ifOverflow="hidden" />
                <Tooltip
                  cursor={CURSOR}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0].payload as HorizonRow;
                    return (
                      <TooltipBox title={`≥ ${row.horizon_h} h ahead`}>
                        <TooltipRow color={MAE} label="MAE" value={formatMW(row.mae_mw)} />
                        <TooltipRow color={OVER} label="Bias" value={formatSignedMW(row.bias_mw)} />
                      </TooltipBox>
                    );
                  }}
                />
                <Line dataKey="mae_mw" stroke={MAE} strokeWidth={2} dot={dot(MAE)} isAnimationActive={false} />
                <Line dataKey="bias_mw" stroke={OVER} strokeWidth={2} dot={dot(OVER)} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="legend">
            <LegendLine color={MAE}>MAE</LegendLine>
            <LegendLine color={OVER}>Bias</LegendLine>
            <LegendRect color="var(--accent-wash)">Lead times seen at day-ahead gate closure</LegendRect>
          </div>
          <p className="insight">
            Even a forecast made <strong>0 h ahead</strong> is off by {formatMW(horizon[0]?.mae_mw)}: most of the
            error is structural bias, not weather uncertainty.
          </p>
        </>
      )}
    </Card>
  );
}

function HourOfDayCard({ accuracy }: { accuracy: Accuracy }) {
  const y = niceAxis(0, Math.max(...accuracy.by_hour.map((r) => r.mae_mw)));
  return (
    <Card title="Error by hour of day" subtitle="MAE by delivery hour, UK time · MW">
      <div className="chart chart--short">
        <ResponsiveContainer>
          <BarChart data={accuracy.by_hour} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              {...AXIS_PROPS}
              dataKey="hour"
              tickFormatter={(h: number) => `${String(h).padStart(2, "0")}:00`}
              interval={2}
            />
            <YAxis {...AXIS_PROPS} width={44} tickFormatter={tickMW} domain={y.domain} ticks={y.ticks} />
            <Tooltip
              cursor={BAR_CURSOR}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Accuracy["by_hour"][number];
                return (
                  <TooltipBox title={`${String(row.hour).padStart(2, "0")}:00`}>
                    <TooltipRow color={MAE} label="MAE" value={formatMW(row.mae_mw)} />
                    <TooltipRow label="Bias" value={formatSignedMW(row.bias_mw)} />
                  </TooltipBox>
                );
              }}
            />
            <Bar dataKey="mae_mw" fill={MAE} maxBarSize={24} shape={<DataEndBar />} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function HistogramCard({ accuracy }: { accuracy: Accuracy }) {
  const rows = accuracy.histogram.map((b) => ({ ...b, mid: (b.from_mw + b.to_mw) / 2 }));
  return (
    <Card title="Distribution of hourly errors" subtitle="Hours per 500 MW error band">
      <div className="chart chart--short">
        <ResponsiveContainer>
          <BarChart data={rows} barCategoryGap={2} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis {...AXIS_PROPS} dataKey="mid" tickFormatter={(v: number) => tickMW(v - 250)} interval={3} />
            <YAxis {...AXIS_PROPS} width={44} allowDecimals={false} />
            <Tooltip
              cursor={BAR_CURSOR}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as (typeof rows)[number];
                return (
                  <TooltipBox title={`${formatSignedMW(row.from_mw)} to ${formatSignedMW(row.to_mw)}`}>
                    <TooltipRow label="Hours" value={row.hours} />
                  </TooltipBox>
                );
              }}
            />
            <Bar dataKey="hours" shape={<DataEndBar />} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.from_mw} fill={r.from_mw >= 0 ? OVER : UNDER} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="legend">
        <LegendRect color={OVER}>Over-forecast hours</LegendRect>
        <LegendRect color={UNDER}>Under-forecast hours</LegendRect>
      </div>
    </Card>
  );
}

function GateComparisonCard({ accuracy }: { accuracy: Accuracy }) {
  const [first, second] = accuracy.gate_comparison;
  const gain = first && second ? (first.summary.mae_mw ?? 0) - (second.summary.mae_mw ?? 0) : null;
  return (
    <Card title="Does a later gate buy a better forecast?" subtitle="Same delivery hours, forecast available at each gate">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Gate closure</th>
              <th>MAE</th>
              <th>RMSE</th>
              <th>Bias</th>
            </tr>
          </thead>
          <tbody>
            {accuracy.gate_comparison.map(({ gate, summary }) => (
              <tr key={gate.id}>
                <td>{gate.label}</td>
                <td>{formatMW(summary.mae_mw)}</td>
                <td>{formatMW(summary.rmse_mw)}</td>
                <td>{formatSignedMW(summary.bias_mw)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {gain !== null && first && (
        <p className="insight">
          N2EX’s later gate picks up the 09:30 forecast, but it only improves MAE by{" "}
          <strong>
            {formatMW(gain)} ({formatPct((100 * gain) / (first.summary.mae_mw ?? 1))})
          </strong>
          . Gate choice can rest on price and liquidity, not forecast quality.
        </p>
      )}
    </Card>
  );
}

function WorstDaysCard({ accuracy }: { accuracy: Accuracy }) {
  return (
    <Card title="Largest misses" subtitle="Delivery days with the highest MAE · open a day to see why">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Delivery day</th>
              <th>MAE</th>
              <th>Bias</th>
              <th>Forecast</th>
              <th>Actual</th>
            </tr>
          </thead>
          <tbody>
            {accuracy.worst_days.map((d) => (
              <tr key={d.delivery_day}>
                <td>
                  <Link to={`/?day=${d.delivery_day}`}>{shortDay(d.delivery_day)}</Link>
                </td>
                <td>{formatMW(d.mae_mw)}</td>
                <td>{formatSignedMW(d.bias_mw)}</td>
                <td>{formatGWh(d.forecast_mwh)}</td>
                <td>{formatGWh(d.actual_mwh)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

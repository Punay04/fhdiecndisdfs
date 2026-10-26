import { useAppContext } from "../AppContext";
import { Card } from "../components/Card";
import { longDay, ukDateTime } from "../lib/format";

export function MethodologyPage() {
  const { meta } = useAppContext();
  const { quality, snapshot } = meta;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Methodology</h1>
          <p>How the numbers in this tool are produced, and what they do and don’t tell you.</p>
        </div>
      </div>

      <div className="stack">
        <div className="grid grid--2" style={{ alignItems: "start" }}>
          <Card title="Data">
            <ul className="prose" style={{ margin: 0, paddingLeft: 18 }}>
              <li>
                <strong>Actual wind</strong>: Elexon BMRS <code>FUELHH</code>, fuel type <code>WIND</code>. Half-hourly
                average generation (MW) for each settlement period.
              </li>
              <li>
                <strong>Forecast wind</strong>: Elexon BMRS <code>WINDFOR</code>. Hourly national wind generation
                forecast (MW), re-published about 8 times a day, each publish covering roughly the next 2–3 days.
              </li>
              <li>
                Snapshot: {quality.forecast_publishes} forecast publishes and {quality.actual_half_hours} half-hours of
                actuals, {quality.missing_actual_half_hours} missing.
                {snapshot.fetched_at && <> Retrieved {ukDateTime(snapshot.fetched_at)}.</>}
              </li>
              {quality.off_schedule_publishes.length > 0 && (
                <li>
                  Off-schedule publishes (normally at :30):{" "}
                  {quality.off_schedule_publishes.map((p) => ukDateTime(p)).join(", ")}. They are used as-is.
                </li>
              )}
            </ul>
          </Card>

          <Card title="Pilot scope">
            <ul className="prose" style={{ margin: 0, paddingLeft: 18 }}>
              <li>
                Purchase decisions made from {longDay(meta.first_decision_day)} to {longDay(meta.last_decision_day)}, so
                delivery days {longDay(meta.delivery_days[0])} to {longDay(meta.delivery_days.at(-1)!)}.
              </li>
              <li>
                A <strong>delivery day</strong> runs 23:00 → 23:00 UK time, as in the GB day-ahead auctions. Clock
                changes (23- and 25-hour days) are handled, although none fall in January.
              </li>
              <li>
                Gate closures: {meta.gates.map((g) => `${g.label.split(" · ")[0]} at ${g.closes_at}`).join("; ")} UK
                time on the day before delivery.
              </li>
            </ul>
          </Card>
        </div>

        <Card title="Which forecast counts">
          <div className="prose">
            <p>
              For each hour of a delivery day, the tool uses the{" "}
              <strong>most recent forecast published at or before the gate closure</strong> on the previous day. That is
              the best information the desk could have bid on. Forecast rows for hours that had already started when the
              forecast was published are ignored.
            </p>
            <p>
              Forecasts are hourly and actuals half-hourly. They are compared hourly, using the mean of the two
              half-hours, which is the average MW over the hour an hourly product delivers.
            </p>
            <p>
              The Explorer uses a simpler rule for research: for each target hour, the latest forecast published at
              least <em>H</em> hours earlier.
            </p>
          </div>
        </Card>

        <Card title="Metrics">
          <div className="prose">
            <ul>
              <li>
                <strong>Error</strong> = forecast − actual. Positive means wind was over-forecast and the desk would
                have procured too little.
              </li>
              <li>
                <strong>MAE</strong> is the average size of the miss. <strong>RMSE</strong> weights large misses more.{" "}
                <strong>Bias</strong> is the average signed error. <strong>nMAE</strong> is MAE as a share of mean
                actual wind. Percentage error per hour (MAPE) is avoided because it blows up when wind is low.
              </li>
              <li>
                <strong>Uncertainty band</strong>: the 10th, 50th and 90th percentiles of actual ÷ forecast over the
                pilot. Multiplying a forecast by them gives a range that widens with the forecast level, which matches
                how the error behaves. <strong>Firm wind (P10)</strong> = forecast × P10 ratio: in 9 of 10 pilot hours
                actual wind was at least this much.
              </li>
              <li>
                <strong>Bias adjustment</strong>: each day’s forecast is reduced by the mean error of the previous 7
                delivery days that had fully settled by gate closure (up to D−2). It uses no information the desk would
                not have had.
              </li>
            </ul>
          </div>
        </Card>

        <div className="grid grid--2" style={{ alignItems: "start" }}>
          <Card title="Caveats">
            <ul className="prose" style={{ margin: 0, paddingLeft: 18 }}>
              <li>
                The band percentiles are estimated on the same month they are shown for (in-sample). In production they
                would be fitted on a trailing window.
              </li>
              <li>One month of winter data. Error behaviour will differ in calmer seasons.</li>
              <li>
                Demand data is out of scope, so the tool sizes the wind side of the position. Volume to buy ≈ expected
                demand − firm wind.
              </li>
              <li>
                The persistent over-forecast, largest at high wind, is consistent with outturn being curtailed (for
                example by transmission constraints) while the forecast is not. These two datasets alone cannot confirm
                that.
              </li>
            </ul>
          </Card>
          <Card title="Next steps">
            <ul className="prose" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Live data feed with an alert when a new forecast moves the firm-wind volume materially.</li>
              <li>Rolling, out-of-sample bands and bias correction, refreshed daily.</li>
              <li>Add solar and embedded generation, then demand, to give a full residual-demand view.</li>
              <li>Conditional bands by forecast level and season.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

# Analysis: January 2026 pilot

Scope:
- 31 delivery days, 2 Jan – 1 Feb 2026, which are purchase decisions made 1–31 Jan.
- 744 delivery hours.
- The forecast used is the latest WINDFOR publish available at the EPEX GB gate
  (09:20 UK on D-1) unless stated otherwise.
- Error = forecast − actual, in MW. Positive means wind was over-forecast.

## Headline numbers

| Metric | EPEX gate (09:20) | N2EX gate (09:50) |
|---|---|---|
| MAE | 2,035 MW | 2,008 MW |
| RMSE | 2,498 MW | 2,500 MW |
| Bias | +1,749 MW | +1,729 MW |
| nMAE (vs mean actual 11,297 MW) | 18.0% | 17.8% |
| Error P10 / P50 / P90 | −542 / +1,592 / +4,095 MW | −478 / +1,530 / +4,144 MW |

## Findings

1. **The forecast systematically over-states wind.**
   - It was too high in 634 of 744 hours (85%), and on 27 of 31 days.
   - The mean forecast was 13.0 GW against a mean actual of 11.3 GW.
2. **The error is mostly bias, not weather uncertainty.**
   - Even the forecast published closest to delivery (0 h ahead) has an MAE of 1,691 MW
     and a bias of +1,478 MW.
   - Going from 0 h to 36 h lead time adds only about 470 MW of MAE (1,691 → 2,160 MW).
3. **The bias grows with the forecast level.**

   | Forecast level | Mean error | Hours |
   |---|---|---|
   | 4–8 GW | +268 MW | 134 |
   | 8–12 GW | +1,483 MW | 200 |
   | 12–16 GW | +1,477 MW | 131 |
   | 16–20 GW | +2,496 MW | 230 |
   | 20 GW+ | +4,603 MW | 42 |

   Actual output never exceeded 17.8 GW, while forecasts reached 21.1 GW. This pattern
   fits outturn being curtailed at high wind (for example by transmission constraints)
   while the forecast is unconstrained. **This is a hypothesis.** It can't be confirmed
   from these two datasets alone.
4. **A later gate barely helps.**
   - N2EX's 09:50 gate picks up the 09:30 publish.
   - That improves MAE by only 27 MW (1.3%).
   - The choice of auction can rest on price and liquidity.
5. **A simple, look-ahead-free bias correction helps a lot.**
   - The correction subtracts the mean error of the previous 7 settled delivery days
     (up to D-2).
   - Over the 648 hours where it applies:
     - MAE falls from 2,048 to 1,563 MW (−24%)
     - RMSE falls from 2,530 to 2,008 MW
     - bias falls from +1,771 to +124 MW
6. **Firm wind sizing.**
   - Actual ÷ forecast had P10 = 0.70, P50 = 0.87 and P90 = 1.06.
   - "Firm wind" = forecast × 0.70 was met or exceeded in 90% of hours.
   - The P10–P90 band contained 80% of hours, as designed.
   - These quantiles are in-sample; production would fit them on a trailing window.
7. **Error is front-loaded overnight.**
   - MAE peaks at 05:00 (2,430 MW) and is lowest at 21:00 (1,786 MW).
   - The worst days were 28 Jan, 12 Jan, 11 Jan, 21 Jan and 27 Jan, all large
     over-forecasts.
   - On 28 Jan the forecast was 271 GWh and the outturn 143 GWh.

## Notes on method

- Forecasts are hourly and actuals half-hourly. They are compared on the hour using the
  mean of the two half-hours.
- The 48 h point of the lead-time curve covers 589 of 744 hours, because each publish
  only extends to about D+2 21:00. All other points cover all 744 hours.
- One publish arrived off-schedule (15 Jan at 12:25 instead of 11:30). It is used as-is.

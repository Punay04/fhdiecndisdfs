const UK_TZ = "Europe/London";

const integer = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const formatMW = (mw: number | null | undefined) =>
  mw === null || mw === undefined ? "–" : `${integer.format(mw)} MW`;

export const formatSignedMW = (mw: number | null | undefined) =>
  mw === null || mw === undefined ? "–" : `${mw > 0 ? "+" : mw < 0 ? "−" : ""}${integer.format(Math.abs(mw))} MW`;

export const formatGW = (mw: number | null | undefined) =>
  mw === null || mw === undefined ? "–" : `${oneDecimal.format(mw / 1000)} GW`;

export const formatSignedGW = (mw: number | null | undefined) =>
  mw === null || mw === undefined
    ? "–"
    : `${mw > 0 ? "+" : mw < 0 ? "−" : ""}${oneDecimal.format(Math.abs(mw) / 1000)} GW`;

export const formatGWh = (mwh: number | null | undefined) =>
  mwh === null || mwh === undefined ? "–" : `${oneDecimal.format(mwh / 1000)} GWh`;

export const formatPct = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined ? "–" : `${value.toFixed(digits)}%`;

/** Compact axis ticks: 12000 -> "12k". */
export const tickMW = (mw: number) => (Math.abs(mw) >= 1000 ? `${mw / 1000}k` : `${mw}`);

const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TZ, hour: "2-digit", minute: "2-digit" });
const dayTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: UK_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const shortDayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
const longDayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** "07:30" in UK time. */
export const ukTime = (iso: string) => timeFmt.format(new Date(iso));
/** "Thu 15 Jan, 07:30" in UK time. */
export const ukDateTime = (iso: string) => dayTimeFmt.format(new Date(iso));
/** Calendar day "2026-01-16" -> "16 Jan". */
export const shortDay = (day: string) => shortDayFmt.format(new Date(`${day}T00:00:00Z`));
/** Calendar day "2026-01-16" -> "Friday 16 January 2026". */
export const longDay = (day: string) => longDayFmt.format(new Date(`${day}T00:00:00Z`));

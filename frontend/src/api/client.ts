import type { Accuracy, Decision, HorizonRow, Meta, Series } from "./types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Params = Record<string, string | number | undefined>;

async function get<T>(path: string, params: Params = {}, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const url = query.size ? `/api${path}?${query}` : `/api${path}`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : response.statusText;
    throw new ApiError(response.status, detail);
  }
  return response.json() as Promise<T>;
}

export const api = {
  meta: (signal?: AbortSignal) => get<Meta>("/meta", {}, signal),
  decision: (day: string, gate: string, signal?: AbortSignal) =>
    get<Decision>("/decision", { delivery_date: day, gate }, signal),
  accuracy: (gate: string, signal?: AbortSignal) => get<Accuracy>("/accuracy", { gate }, signal),
  horizon: (signal?: AbortSignal) => get<HorizonRow[]>("/horizon", {}, signal),
  series: (horizonH: number, start: string, end: string, signal?: AbortSignal) =>
    get<Series>("/series", { horizon_h: horizonH, start, end }, signal),
};

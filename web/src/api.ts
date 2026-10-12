// API base URL. Defaults to the local server; override via VITE_API_URL for
// deployed/preview environments (QAWolf runs against whatever URL this points at).
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface AppState {
  counter: number;
  lastAction: string;
}

// Thrown by call() when the API answers with a non-2xx status. Carries the
// request details so callers (e.g. Pendo tracking) don't have to parse the message.
export class ApiError extends Error {
  constructor(
    readonly method: "GET" | "POST",
    readonly path: string,
    readonly status: number
  ) {
    super(`${method} ${path} failed: ${status}`);
    this.name = "ApiError";
  }
}

async function call(path: string, method: "GET" | "POST"): Promise<AppState> {
  const res = await fetch(`${BASE}${path}`, { method });
  if (!res.ok) throw new ApiError(method, path, res.status);
  return res.json() as Promise<AppState>;
}

export const api = {
  getState: () => call("/api/state", "GET"),
  increment: () => call("/api/increment", "POST"),
  decrement: () => call("/api/decrement", "POST"),
  reset: () => call("/api/reset", "POST"),
};

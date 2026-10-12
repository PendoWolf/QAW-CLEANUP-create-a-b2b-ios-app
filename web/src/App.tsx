import { useEffect, useRef, useState } from "react";
import { api, ApiError, type AppState } from "./api";

type Action = "load" | "increment" | "decrement" | "reset" | "refresh";
type TrackProps = Record<string, string | number | boolean>;

// Seam for Pendo. Novus installs the Pendo agent, which provides window.pendo
// at runtime; this fires a Track Event for each action. No-op when the agent
// isn't present (local dev), so the app and Playwright mocks both stay simple.
// Sent as "demo-<name>". Pendo matches the full name exactly, so renaming an
// event (or this prefix) splits its data into a new, separate event.
function trackEvent(name: Action | "action-failed", props?: TrackProps) {
  if (typeof window !== "undefined") {
    window.pendo?.track?.(`demo-${name}`, props);
  }
}

// Properties sent with "demo-<action>" when the action's request succeeds.
function successProps(
  action: Action,
  previous: AppState,
  next: AppState,
  recoveredFromError: boolean
): TrackProps {
  switch (action) {
    case "load":
      return { counter: next.counter, lastAction: next.lastAction };
    case "increment":
    case "decrement":
      return { counter: next.counter, previousCounter: previous.counter, recoveredFromError };
    case "reset":
      // The counter is always 0 after a reset, so report what was wiped instead.
      return {
        previousCounter: previous.counter,
        previousLastAction: previous.lastAction,
        recoveredFromError,
      };
    case "refresh":
      return {
        counter: next.counter,
        previousCounter: previous.counter,
        counterChanged: next.counter !== previous.counter,
        lastAction: next.lastAction,
        recoveredFromError,
      };
  }
}

// Properties sent with "demo-action-failed". An ApiError means the API answered
// with a non-2xx status; fetch rejects with a TypeError when the API is
// unreachable or the origin is blocked by CORS. Anything else (e.g. a response
// body that isn't JSON) is "unknown".
function failureProps(action: Action, e: unknown): TrackProps {
  const errorMessage = (e instanceof Error ? e.message : String(e)).slice(0, 100);
  if (e instanceof ApiError) {
    return {
      action,
      errorMessage,
      errorType: "http",
      statusCode: e.status,
      httpMethod: e.method,
      endpoint: e.path,
    };
  }
  return { action, errorMessage, errorType: e instanceof TypeError ? "network" : "unknown" };
}

// <StrictMode> runs the mount effect twice in development. Module-level (not a
// ref) so the initial load is still reported to Pendo once per page load.
let initialLoadReported = false;

export default function App() {
  const [state, setState] = useState<AppState>({ counter: 0, lastAction: "none" });
  const [error, setError] = useState<string | null>(null);
  // Mirrors the state on screen. Read when a response arrives rather than at
  // click time, so previous* properties stay accurate when requests overlap.
  const stateRef = useRef(state);

  const run = async (name: Action, fn: () => Promise<AppState>, report = true) => {
    const recoveredFromError = error !== null;
    try {
      setError(null);
      const next = await fn();
      const previous = stateRef.current;
      stateRef.current = next;
      setState(next);
      if (report) trackEvent(name, successProps(name, previous, next, recoveredFromError));
    } catch (e) {
      setError((e as Error).message);
      if (report) trackEvent("action-failed", failureProps(name, e));
    }
  };

  useEffect(() => {
    run("load", api.getState, !initialLoadReported);
    initialLoadReported = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 480, margin: "4rem auto", textAlign: "center" }}>
      <h1>QAWolf Demo</h1>

      <p data-testid="counter-value" style={{ fontSize: "3rem", margin: "1rem 0" }}>
        {state.counter}
      </p>
      <p data-testid="last-action" style={{ color: "#666" }}>
        Last action: {state.lastAction}
      </p>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <button data-testid="btn-increment" onClick={() => run("increment", api.increment)}>
          Increment
        </button>
        <button data-testid="btn-decrement" onClick={() => run("decrement", api.decrement)}>
          Decrement
        </button>
        <button data-testid="btn-reset" onClick={() => run("reset", api.reset)}>
          Reset
        </button>
        <button data-testid="btn-refresh" onClick={() => run("refresh", api.getState)}>
          Refresh
        </button>
      </div>

      {error && (
        <p data-testid="error" style={{ color: "crimson", marginTop: 16 }}>
          {error}
        </p>
      )}
    </main>
  );
}

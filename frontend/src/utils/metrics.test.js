import { describe, it, expect, beforeEach } from "vitest";
import {
  computeRate,
  parseStatus,
  getHealthMessage,
  classifyError,
  formatMetricsEntry,
  aggregateByService,
  filterRequestLog,
  toCsv,
  loadSettings,
  saveSettings,
  resolveTheme,
  applyTheme,
  computeServiceErrorRates,
  findAlertingServices,
  parseTrace,
  parseServices,
  normalizeBreakerState,
  breakerBadge,
} from "./metrics";

describe("computeRate", () => {
  it("returns 0 when previous is null", () => {
    expect(computeRate(10, null)).toBe(0);
  });

  it("returns 0 when previous is undefined", () => {
    expect(computeRate(10, undefined)).toBe(0);
  });

  it("computes rate correctly with default interval", () => {
    expect(computeRate(20, 10)).toBe(6.7);
  });

  it("computes rate with custom interval", () => {
    expect(computeRate(20, 10, 2)).toBe(5);
  });

  it("returns 0 when current equals previous", () => {
    expect(computeRate(10, 10)).toBe(0);
  });

  it("clamps negative values to 0", () => {
    expect(computeRate(5, 10)).toBe(0);
  });
});

describe("parseStatus", () => {
  it("parses a full status response", () => {
    const data = {
      uptimeSec: 120,
      requestsTotal: 50,
      errorsTotal: 2,
      rateLimitedTotal: 5,
      activeSimulations: 1,
    };
    expect(parseStatus(data)).toEqual(data);
  });

  it("returns dashes for missing fields", () => {
    expect(parseStatus({})).toEqual({
      uptimeSec: "—",
      requestsTotal: "—",
      errorsTotal: "—",
      rateLimitedTotal: "—",
      activeSimulations: "—",
    });
  });

  it("returns dashes for null input", () => {
    expect(parseStatus(null)).toEqual({
      uptimeSec: "—",
      requestsTotal: "—",
      errorsTotal: "—",
      rateLimitedTotal: "—",
      activeSimulations: "—",
    });
  });

  it("handles partial data", () => {
    const result = parseStatus({ uptimeSec: 60, requestsTotal: 10 });
    expect(result.uptimeSec).toBe(60);
    expect(result.requestsTotal).toBe(10);
    expect(result.errorsTotal).toBe("—");
  });
});

describe("getHealthMessage", () => {
  it('returns "UP" when status is ok', () => {
    expect(getHealthMessage({ status: "ok" })).toBe("UP");
  });

  it("returns unexpected payload message for other statuses", () => {
    expect(getHealthMessage({ status: "degraded" })).toBe(
      "UP (unexpected payload)"
    );
  });

  it("handles missing status field", () => {
    expect(getHealthMessage({})).toBe("UP (unexpected payload)");
  });
});

describe("classifyError", () => {
  it("classifies 429 as rate limited", () => {
    const result = classifyError(429);
    expect(result.label).toBe("Rate Limited");
    expect(result.bg).toBe("#fffbeb");
  });

  it("classifies 500 as server error", () => {
    const result = classifyError(500);
    expect(result.label).toBe("Error");
    expect(result.message).toContain("Server error");
  });

  it("classifies 503 as server error", () => {
    const result = classifyError(503);
    expect(result.message).toContain("503");
  });

  it("classifies network_error as offline", () => {
    const result = classifyError("network_error", "Failed to fetch");
    expect(result.label).toBe("Offline");
    expect(result.color).toBe("#374151");
  });

  it("classifies other errors with custom message", () => {
    const result = classifyError(400, "Bad request");
    expect(result.label).toBe("Error");
    expect(result.message).toBe("Bad request");
  });

  it("uses default message when none provided", () => {
    const result = classifyError(400);
    expect(result.message).toBe("Request failed");
  });
});

describe("formatMetricsEntry", () => {
  it("computes all three rates", () => {
    const entry = formatMetricsEntry(20, 5, 3, 10, 2, 1);
    expect(entry.reqsPerSec).toBe(6.7);
    expect(entry.errsPerSec).toBe(2);
    expect(entry.rlPerSec).toBe(1.3);
    expect(entry.time).toBeDefined();
  });

  it("returns 0 rates when no previous values", () => {
    const entry = formatMetricsEntry(20, 5, 3, null, null, null);
    expect(entry.reqsPerSec).toBe(0);
    expect(entry.errsPerSec).toBe(0);
    expect(entry.rlPerSec).toBe(0);
  });
});

describe("aggregateByService", () => {
  it("returns empty array for empty log", () => {
    expect(aggregateByService([])).toEqual([]);
    expect(aggregateByService(null)).toEqual([]);
    expect(aggregateByService(undefined)).toEqual([]);
  });

  it("aggregates a single service correctly", () => {
    const log = [
      { routedTo: "orders-service-1", status: 200, latency: 100 },
      { routedTo: "orders-service-1", status: 200, latency: 200 },
    ];
    const result = aggregateByService(log);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      service: "orders-service-1",
      total: 2,
      success: 2,
      rateLimited: 0,
      errors: 0,
      avgLatency: 150,
    });
  });

  it("aggregates multiple services and counts statuses", () => {
    const log = [
      { routedTo: "orders-service-1", status: 200, latency: 100 },
      { routedTo: "analytics-service-1", status: 429, latency: 50 },
      { routedTo: "analytics-service-1", status: 500, latency: 80 },
      { routedTo: "orders-service-1", status: 200, latency: 200 },
    ];
    const result = aggregateByService(log);
    expect(result).toHaveLength(2);
    const orders = result.find((r) => r.service === "orders-service-1");
    const analytics = result.find((r) => r.service === "analytics-service-1");
    expect(orders).toMatchObject({ total: 2, success: 2, rateLimited: 0, errors: 0, avgLatency: 150 });
    expect(analytics).toMatchObject({ total: 2, success: 0, rateLimited: 1, errors: 1, avgLatency: 65 });
  });

  it("handles missing routedTo and latency gracefully", () => {
    const log = [
      { status: 200 },
      { routedTo: null, status: 500, latency: "bad" },
    ];
    const result = aggregateByService(log);
    expect(result).toHaveLength(1);
    expect(result[0].service).toBe("unknown");
    expect(result[0].total).toBe(2);
    expect(result[0].avgLatency).toBe(0);
  });
});

describe("filterRequestLog", () => {
  const log = [
    { id: "abc123", routedTo: "orders-service-1", status: 200 },
    { id: "def456", routedTo: "orders-service-1", status: 429 },
    { id: "ghi789", routedTo: "analytics-service-1", status: 500 },
    { id: "jkl012", routedTo: "analytics-service-1", status: 200 },
  ];

  it("returns full log when no filters applied", () => {
    expect(filterRequestLog(log, {})).toHaveLength(4);
    expect(filterRequestLog(log)).toHaveLength(4);
  });

  it("filters by service", () => {
    const result = filterRequestLog(log, { service: "orders-service-1" });
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.routedTo === "orders-service-1")).toBe(true);
  });

  it("filters by status success", () => {
    const result = filterRequestLog(log, { status: "success" });
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.status === 200)).toBe(true);
  });

  it("filters by status rateLimited", () => {
    const result = filterRequestLog(log, { status: "rateLimited" });
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe(429);
  });

  it("filters by status error", () => {
    const result = filterRequestLog(log, { status: "error" });
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe(500);
  });

  it("filters by search substring on id", () => {
    expect(filterRequestLog(log, { search: "abc" })).toHaveLength(1);
    expect(filterRequestLog(log, { search: "ABC" })).toHaveLength(1);
    expect(filterRequestLog(log, { search: "xyz" })).toHaveLength(0);
  });

  it("returns empty array for non-array input", () => {
    expect(filterRequestLog(null)).toEqual([]);
    expect(filterRequestLog(undefined)).toEqual([]);
  });
});

describe("toCsv", () => {
  it("returns header only for empty log", () => {
    expect(toCsv([])).toBe("time,requestId,routedTo,status,latencyMs\n");
    expect(toCsv(null)).toBe("time,requestId,routedTo,status,latencyMs\n");
  });

  it("formats a single row correctly", () => {
    const csv = toCsv([
      { time: "12:00:00", id: "abc", routedTo: "orders-1", status: 200, latency: 45 },
    ]);
    expect(csv).toBe(
      "time,requestId,routedTo,status,latencyMs\n12:00:00,abc,orders-1,200,45\n"
    );
  });

  it("formats multiple rows", () => {
    const csv = toCsv([
      { time: "12:00:00", id: "abc", routedTo: "orders-1", status: 200, latency: 45 },
      { time: "12:00:01", id: "def", routedTo: "orders-2", status: 429, latency: 12 },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("12:00:00,abc,orders-1,200,45");
    expect(lines[2]).toBe("12:00:01,def,orders-2,429,12");
  });

  it("escapes commas and quotes in fields", () => {
    const csv = toCsv([
      { time: "12:00:00", id: 'abc"def', routedTo: "orders,svc", status: 200, latency: 45 },
    ]);
    expect(csv).toContain('"abc""def"');
    expect(csv).toContain('"orders,svc"');
  });
});

describe("loadSettings / saveSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns defaults when localStorage is empty", () => {
    const s = loadSettings();
    expect(s.pollInterval).toBe(1500);
    expect(s.maxLogSize).toBe(100);
    expect(s.chartWindow).toBe(30);
    expect(s.theme).toBe("system");
  });

  it("round-trips saved settings including theme", () => {
    saveSettings({ pollInterval: 3000, maxLogSize: 200, chartWindow: 60, theme: "dark" });
    const s = loadSettings();
    expect(s.pollInterval).toBe(3000);
    expect(s.maxLogSize).toBe(200);
    expect(s.chartWindow).toBe(60);
    expect(s.theme).toBe("dark");
  });

  it("coerces unknown theme value back to system", () => {
    saveSettings({ pollInterval: 1500, maxLogSize: 100, chartWindow: 30, theme: "neon" });
    expect(loadSettings().theme).toBe("system");
  });

  it("falls back to defaults when localStorage has invalid JSON", () => {
    localStorage.setItem("edgeforge:settings", "{not valid json");
    const s = loadSettings();
    expect(s.pollInterval).toBe(1500);
    expect(s.maxLogSize).toBe(100);
    expect(s.chartWindow).toBe(30);
    expect(s.theme).toBe("system");
  });
});

describe("resolveTheme / applyTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("resolveTheme returns explicit theme when light or dark", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("resolveTheme follows prefers-color-scheme when system", () => {
    const original = window.matchMedia;
    window.matchMedia = (q) => ({
      matches: q.includes("dark"),
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    expect(resolveTheme("system")).toBe("dark");
    window.matchMedia = original;
  });

  it("applyTheme writes data-theme on documentElement", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});

describe("computeServiceErrorRates", () => {
  it("returns empty array for empty log", () => {
    expect(computeServiceErrorRates([])).toEqual([]);
    expect(computeServiceErrorRates(null)).toEqual([]);
  });

  it("computes per-service error rate", () => {
    const log = [
      { routedTo: "orders-1", status: 500 },
      { routedTo: "orders-1", status: 200 },
      { routedTo: "orders-1", status: 500 },
      { routedTo: "orders-1", status: 200 },
    ];
    const result = computeServiceErrorRates(log);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      service: "orders-1",
      total: 4,
      errors: 2,
      errorRatePct: 50,
    });
  });

  it("excludes 429 from errors and 'unknown' (no routedTo) from results", () => {
    const log = [
      { routedTo: "orders-1", status: 429 },
      { routedTo: "orders-1", status: 200 },
      { status: 500 },
      { routedTo: "—", status: 500 },
    ];
    const result = computeServiceErrorRates(log);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      service: "orders-1",
      total: 2,
      errors: 0,
      errorRatePct: 0,
    });
  });

  it("treats string 'error' status as a failure (network errors)", () => {
    const log = [
      { routedTo: "orders-1", status: "error" },
      { routedTo: "orders-1", status: 200 },
    ];
    const result = computeServiceErrorRates(log);
    expect(result[0].errors).toBe(1);
    expect(result[0].errorRatePct).toBe(50);
  });

  it("respects windowSize and only looks at the most recent N entries (newest-first log)", () => {
    const log = [
      { routedTo: "orders-1", status: 500 },
      { routedTo: "orders-1", status: 500 },
      { routedTo: "orders-1", status: 200 },
      { routedTo: "orders-1", status: 200 },
      { routedTo: "orders-1", status: 200 },
    ];
    expect(computeServiceErrorRates(log, 2)[0]).toEqual({
      service: "orders-1",
      total: 2,
      errors: 2,
      errorRatePct: 100,
    });
  });
});

describe("findAlertingServices", () => {
  const log = [
    { routedTo: "orders-1", status: 500 },
    { routedTo: "orders-1", status: 500 },
    { routedTo: "orders-1", status: 500 },
    { routedTo: "orders-1", status: 200 },
    { routedTo: "analytics-1", status: 200 },
    { routedTo: "analytics-1", status: 200 },
    { routedTo: "analytics-1", status: 200 },
  ];

  it("returns empty list when alerts disabled", () => {
    expect(findAlertingServices(log, { enableAlerts: false, errorRateAlertPct: 10 })).toEqual([]);
  });

  it("returns services exceeding the threshold", () => {
    const result = findAlertingServices(log, {
      enableAlerts: true,
      errorRateAlertPct: 50,
      alertWindowSize: 50,
    });
    expect(result).toHaveLength(1);
    expect(result[0].service).toBe("orders-1");
    expect(result[0].errorRatePct).toBe(75);
  });

  it("returns empty list when no service crosses the threshold", () => {
    const result = findAlertingServices(log, {
      enableAlerts: true,
      errorRateAlertPct: 90,
      alertWindowSize: 50,
    });
    expect(result).toEqual([]);
  });

  it("ignores services with fewer than 3 requests in the window", () => {
    const tinyLog = [
      { routedTo: "orders-1", status: 500 },
      { routedTo: "orders-1", status: 500 },
    ];
    expect(
      findAlertingServices(tinyLog, {
        enableAlerts: true,
        errorRateAlertPct: 10,
        alertWindowSize: 50,
      })
    ).toEqual([]);
  });

  it("sorts highest error rate first", () => {
    const mixedLog = [
      { routedTo: "a", status: 500 },
      { routedTo: "a", status: 500 },
      { routedTo: "a", status: 200 },
      { routedTo: "b", status: 500 },
      { routedTo: "b", status: 500 },
      { routedTo: "b", status: 500 },
    ];
    const result = findAlertingServices(mixedLog, {
      enableAlerts: true,
      errorRateAlertPct: 10,
      alertWindowSize: 50,
    });
    expect(result.map((r) => r.service)).toEqual(["b", "a"]);
  });
});

describe("parseTrace", () => {
  it("returns empty array when there is no trace", () => {
    expect(parseTrace(null)).toEqual([]);
    expect(parseTrace({})).toEqual([]);
    expect(parseTrace({ response: {} })).toEqual([]);
    expect(parseTrace({ response: { trace: null } })).toEqual([]);
    expect(parseTrace({ response: { trace: [] } })).toEqual([]);
  });

  it("normalizes a single-attempt success trace", () => {
    const entry = {
      response: {
        trace: [
          { attempt: 1, instance: "orders-service-1", status: "success", latencyMs: 35 },
        ],
      },
    };
    expect(parseTrace(entry)).toEqual([
      { attempt: 1, instance: "orders-service-1", outcome: "success", latencyMs: 35, error: null },
    ]);
  });

  it("normalizes a retry trace with a failed first attempt", () => {
    const entry = {
      response: {
        trace: [
          { attempt: 1, instance: "orders-service-1", status: "fail", latencyMs: 120, error: "connection refused" },
          { attempt: 2, instance: "orders-service-2", status: "success", latencyMs: 30 },
        ],
      },
    };
    const result = parseTrace(entry);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ attempt: 1, outcome: "fail", error: "connection refused" });
    expect(result[1]).toMatchObject({ attempt: 2, outcome: "success", error: null });
  });

  it("backfills missing attempt numbers and latency", () => {
    const entry = {
      response: {
        trace: [
          { instance: "a", status: "success" },
          { instance: "b", status: "fail", latencyMs: "bad" },
        ],
      },
    };
    const result = parseTrace(entry);
    expect(result[0].attempt).toBe(1);
    expect(result[1].attempt).toBe(2);
    expect(result[0].latencyMs).toBe(null);
    expect(result[1].latencyMs).toBe(null);
  });

  it("normalizes alternate status keywords (ok/error)", () => {
    const entry = {
      response: {
        trace: [
          { attempt: 1, instance: "a", status: "ok" },
          { attempt: 2, instance: "b", status: "ERROR" },
        ],
      },
    };
    const result = parseTrace(entry);
    expect(result[0].outcome).toBe("success");
    expect(result[1].outcome).toBe("fail");
  });

  it("accepts a trace at the top level (not nested under response)", () => {
    const entry = { trace: [{ attempt: 1, instance: "a", status: "success" }] };
    expect(parseTrace(entry)).toHaveLength(1);
  });
});

describe("parseServices", () => {
  it("returns empty array for null/non-object input", () => {
    expect(parseServices(null)).toEqual([]);
    expect(parseServices(undefined)).toEqual([]);
    expect(parseServices("nope")).toEqual([]);
  });

  it("normalizes a multi-service registry response", () => {
    const data = {
      orders: {
        requests: 5,
        instances: [
          {
            name: "orders-service-1",
            url: "http://localhost:9001",
            healthy: true,
            activeRequests: 0,
            requests: 3,
            failures: 1,
            breaker: "closed",
          },
          {
            name: "orders-service-2",
            url: "http://localhost:9002",
            healthy: false,
            activeRequests: 0,
            requests: 2,
            failures: 5,
            breaker: "open",
          },
        ],
      },
    };
    const result = parseServices(data);
    expect(result).toHaveLength(1);
    expect(result[0].service).toBe("orders");
    expect(result[0].requests).toBe(5);
    expect(result[0].instances).toHaveLength(2);
    expect(result[0].instances[0].breaker).toBe("closed");
    expect(result[0].instances[1].breaker).toBe("open");
    expect(result[0].instances[1].healthy).toBe(false);
  });

  it("falls back to safe defaults for missing fields", () => {
    const data = { analytics: { instances: [{ name: "analytics-1" }] } };
    const result = parseServices(data);
    const inst = result[0].instances[0];
    expect(inst.healthy).toBe(true);
    expect(inst.activeRequests).toBe(0);
    expect(inst.requests).toBe(0);
    expect(inst.failures).toBe(0);
    expect(inst.breaker).toBe("unknown");
  });

  it("handles a service with no instances", () => {
    const data = { orders: { requests: 0 } };
    expect(parseServices(data)[0]).toEqual({
      service: "orders",
      requests: 0,
      instances: [],
    });
  });
});

describe("normalizeBreakerState / breakerBadge", () => {
  it("normalizes known states", () => {
    expect(normalizeBreakerState("OPEN")).toBe("open");
    expect(normalizeBreakerState("Half-Open")).toBe("half-open");
    expect(normalizeBreakerState("half_open")).toBe("half-open");
    expect(normalizeBreakerState("closed")).toBe("closed");
  });

  it("returns 'unknown' for missing or invalid states", () => {
    expect(normalizeBreakerState(undefined)).toBe("unknown");
    expect(normalizeBreakerState("")).toBe("unknown");
    expect(normalizeBreakerState("tripped")).toBe("unknown");
  });

  it("breakerBadge returns red palette for open, yellow for half-open, green for closed", () => {
    expect(breakerBadge("open").label).toBe("open");
    expect(breakerBadge("open").color).toBe("#b91c1c");
    expect(breakerBadge("half-open").color).toBe("#92400e");
    expect(breakerBadge("closed").color).toBe("#065f46");
  });

  it("breakerBadge falls back to neutral palette for unknown state", () => {
    const badge = breakerBadge(undefined);
    expect(badge.label).toBe("—");
    expect(badge.color).toBe("var(--text-secondary)");
  });
});

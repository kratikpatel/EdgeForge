import { describe, it, expect } from "vitest";
import {
  computeRate,
  parseStatus,
  getHealthMessage,
  classifyError,
  formatMetricsEntry,
  aggregateByService,
  filterRequestLog,
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

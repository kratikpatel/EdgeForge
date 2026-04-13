export function computeRate(current, previous, intervalSec = 1.5) {
  if (previous === null || previous === undefined) return 0;
  return Math.max(0, Math.round(((current - previous) / intervalSec) * 10) / 10);
}

export function parseStatus(data) {
  return {
    uptimeSec: data?.uptimeSec ?? "—",
    requestsTotal: data?.requestsTotal ?? "—",
    errorsTotal: data?.errorsTotal ?? "—",
    rateLimitedTotal: data?.rateLimitedTotal ?? "—",
    activeSimulations: data?.activeSimulations ?? "—",
  };
}

export function getHealthMessage(data) {
  if (data?.status === "ok") return "UP";
  return "UP (unexpected payload)";
}

export function classifyError(status, message) {
  if (status === 429) {
    return {
      label: "Rate Limited",
      message: "Rate limited — too many requests. Try again shortly.",
      bg: "#fffbeb",
      color: "#92400e",
    };
  }
  if (status >= 500) {
    return {
      label: "Error",
      message: `Server error (${status}). The backend may be experiencing issues.`,
      bg: "#fef2f2",
      color: "#b91c1c",
    };
  }
  if (status === "network_error") {
    return {
      label: "Offline",
      message: message || "Cannot reach backend.",
      bg: "#f3f4f6",
      color: "#374151",
    };
  }
  return {
    label: "Error",
    message: message || "Request failed",
    bg: "#fef2f2",
    color: "#b91c1c",
  };
}

export function aggregateByService(requestLog) {
  if (!Array.isArray(requestLog) || requestLog.length === 0) return [];

  const byService = {};
  for (const entry of requestLog) {
    const service = entry?.routedTo || "unknown";
    if (!byService[service]) {
      byService[service] = {
        service,
        total: 0,
        success: 0,
        rateLimited: 0,
        errors: 0,
        latencySum: 0,
        latencyCount: 0,
      };
    }
    const bucket = byService[service];
    bucket.total += 1;
    const status = Number(entry?.status);
    if (status === 429) bucket.rateLimited += 1;
    else if (status >= 200 && status < 300) bucket.success += 1;
    else bucket.errors += 1;

    const latency = Number(entry?.latency);
    if (Number.isFinite(latency)) {
      bucket.latencySum += latency;
      bucket.latencyCount += 1;
    }
  }

  return Object.values(byService).map((b) => ({
    service: b.service,
    total: b.total,
    success: b.success,
    rateLimited: b.rateLimited,
    errors: b.errors,
    avgLatency: b.latencyCount > 0 ? Math.round(b.latencySum / b.latencyCount) : 0,
  }));
}

export function formatMetricsEntry(reqs, errs, rl, prevReqs, prevErrs, prevRl) {
  return {
    time: new Date().toLocaleTimeString(),
    reqsPerSec: computeRate(reqs, prevReqs),
    errsPerSec: computeRate(errs, prevErrs),
    rlPerSec: computeRate(rl, prevRl),
  };
}

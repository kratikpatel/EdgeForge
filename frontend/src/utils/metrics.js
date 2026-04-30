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

export function filterRequestLog(log, filters = {}) {
  if (!Array.isArray(log)) return [];
  const { service = "all", status = "all", search = "" } = filters;
  const searchLower = (search || "").trim().toLowerCase();

  return log.filter((entry) => {
    if (service !== "all" && entry?.routedTo !== service) return false;

    const code = Number(entry?.status);
    if (status === "success" && !(code >= 200 && code < 300)) return false;
    if (status === "rateLimited" && code !== 429) return false;
    if (status === "error" && !(code >= 400 && code !== 429)) return false;

    if (searchLower) {
      const id = String(entry?.id || "").toLowerCase();
      if (!id.includes(searchLower)) return false;
    }

    return true;
  });
}

export function toCsv(requestLog) {
  const header = "time,requestId,routedTo,status,latencyMs";
  if (!Array.isArray(requestLog) || requestLog.length === 0) return header + "\n";

  const escape = (val) => {
    const s = val === null || val === undefined ? "" : String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = requestLog.map((entry) =>
    [
      escape(entry?.time),
      escape(entry?.id),
      escape(entry?.routedTo),
      escape(entry?.status),
      escape(entry?.latency),
    ].join(",")
  );

  return [header, ...rows].join("\n") + "\n";
}

const SETTINGS_KEY = "edgeforge:settings";
const VALID_THEMES = ["system", "light", "dark"];
const DEFAULT_SETTINGS = {
  pollInterval: 1500,
  maxLogSize: 100,
  chartWindow: 30,
  theme: "system",
  enableAlerts: true,
  errorRateAlertPct: 10,
  alertWindowSize: 20,
};

export function loadSettings() {
  try {
    const raw = typeof localStorage !== "undefined" && localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    if (!VALID_THEMES.includes(merged.theme)) merged.theme = "system";
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }
  } catch {
    /* ignore */
  }
}

export function resolveTheme(theme) {
  if (theme === "light" || theme === "dark") return theme;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

export function applyTheme(theme) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(theme);
  document.documentElement.setAttribute("data-theme", resolved);
}

export function computeServiceErrorRates(requestLog, windowSize = 20) {
  if (!Array.isArray(requestLog) || requestLog.length === 0) return [];

  const slice = requestLog.slice(0, Math.max(1, windowSize));
  const byService = {};
  for (const entry of slice) {
    const service = entry?.routedTo;
    if (!service || service === "—") continue;
    if (!byService[service]) byService[service] = { service, total: 0, errors: 0 };
    const code = Number(entry?.status);
    byService[service].total += 1;
    if ((Number.isFinite(code) && code >= 400 && code !== 429) || entry?.status === "error") {
      byService[service].errors += 1;
    }
  }

  return Object.values(byService).map((b) => ({
    service: b.service,
    total: b.total,
    errors: b.errors,
    errorRatePct: b.total > 0 ? Math.round((b.errors / b.total) * 1000) / 10 : 0,
  }));
}

export function parseTrace(entry) {
  const trace = entry?.response?.trace ?? entry?.trace;
  if (!Array.isArray(trace) || trace.length === 0) return [];

  return trace.map((step, i) => {
    const attempt = Number(step?.attempt);
    const latencyMs = Number(step?.latencyMs);
    const rawStatus = (step?.status ?? "").toString().toLowerCase();
    const outcome =
      rawStatus === "success" || rawStatus === "ok"
        ? "success"
        : rawStatus === "fail" || rawStatus === "error" || rawStatus === "failure"
          ? "fail"
          : rawStatus || "unknown";
    return {
      attempt: Number.isFinite(attempt) && attempt > 0 ? attempt : i + 1,
      instance: step?.instance || "—",
      outcome,
      latencyMs: Number.isFinite(latencyMs) ? latencyMs : null,
      error: step?.error || null,
    };
  });
}

export function findAlertingServices(requestLog, settings) {
  if (!settings?.enableAlerts) return [];
  const threshold = Number(settings?.errorRateAlertPct);
  if (!Number.isFinite(threshold) || threshold <= 0) return [];
  const windowSize = Number(settings?.alertWindowSize) || 20;

  return computeServiceErrorRates(requestLog, windowSize)
    .filter((row) => row.total >= 3 && row.errorRatePct >= threshold)
    .sort((a, b) => b.errorRatePct - a.errorRatePct);
}

export function formatMetricsEntry(reqs, errs, rl, prevReqs, prevErrs, prevRl) {
  return {
    time: new Date().toLocaleTimeString(),
    reqsPerSec: computeRate(reqs, prevReqs),
    errsPerSec: computeRate(errs, prevErrs),
    rlPerSec: computeRate(rl, prevRl),
  };
}

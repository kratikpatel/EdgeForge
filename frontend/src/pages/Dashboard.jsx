import { useEffect, useRef, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { API_BASE } from "../config";
import {
  aggregateByService,
  filterRequestLog,
  toCsv,
  loadSettings,
  saveSettings,
  applyTheme,
  findAlertingServices,
  parseTrace,
  parseServices,
  breakerBadge,
} from "../utils/metrics";

function Card({ title, children }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 16,
        background: "var(--bg-card)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div
        style={{
          fontSize: 14,
          color: "var(--text-strong)",
          marginBottom: 10,
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function Dashboard() {
  const [settings, setSettings] = useState(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);

  function updateSetting(key, value) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
  }

  useEffect(() => {
    applyTheme(settings?.theme);
    if (settings?.theme !== "system" || typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [settings?.theme]);

  const [health, setHealth] = useState({
    state: "loading",
    message: "Checking...",
  });

  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
      try {
        const res = await fetch(`${API_BASE}/health`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        setHealth({
          state: "up",
          message: data?.status === "ok" ? "UP" : "UP (unexpected payload)",
        });
      } catch {
        if (cancelled) return;
        setHealth({ state: "down", message: "DOWN" });
      }
    }

    checkHealth();
    return () => {
      cancelled = true;
    };
  }, []);
  const [status, setStatus] = useState({
    uptimeSec: "—",
    requestsTotal: "—",
    errorsTotal: "—",
    rateLimitedTotal: "—",
    activeSimulations: "—",
  });

  useEffect(() => {
    let cancelled = false;
    let intervalId = null;

    async function fetchStatus() {
      try {
        const res = await fetch(`${API_BASE}/api/v1/status`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        setStatus({
          uptimeSec: data?.uptimeSec ?? "—",
          requestsTotal: data?.requestsTotal ?? "—",
          errorsTotal: data?.errorsTotal ?? "—",
          rateLimitedTotal: data?.rateLimitedTotal ?? "—",
          activeSimulations: data?.activeSimulations ?? "—",
        });
      } catch {
        if (cancelled) return;
        setStatus({
          uptimeSec: "—",
          requestsTotal: "—",
          errorsTotal: "—",
          rateLimitedTotal: "—",
          activeSimulations: "—",
        });
      }
    }

    fetchStatus();
    intervalId = setInterval(fetchStatus, settings?.pollInterval || 1500);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.pollInterval]);
  const [metricsHistory, setMetricsHistory] = useState([]);
  const prevRequests = useRef(null);
  const prevErrors = useRef(null);
  const prevRateLimited = useRef(null);

  useEffect(() => {
    if (status.requestsTotal === "—") return;

    const now = new Date().toLocaleTimeString();
    const reqs = Number(status.requestsTotal);
    const errs = Number(status.errorsTotal);
    const rl = Number(status.rateLimitedTotal);

    const reqsPerSec =
      prevRequests.current !== null
        ? Math.max(0, Math.round(((reqs - prevRequests.current) / 1.5) * 10) / 10)
        : 0;
    const errsPerSec =
      prevErrors.current !== null
        ? Math.max(0, Math.round(((errs - prevErrors.current) / 1.5) * 10) / 10)
        : 0;
    const rlPerSec =
      prevRateLimited.current !== null
        ? Math.max(0, Math.round(((rl - prevRateLimited.current) / 1.5) * 10) / 10)
        : 0;

    prevRequests.current = reqs;
    prevErrors.current = errs;
    prevRateLimited.current = rl;

    setMetricsHistory((prev) =>
      [...prev, { time: now, reqsPerSec, errsPerSec, rlPerSec }].slice(-(settings?.chartWindow || 30))
    );
  }, [status, settings?.chartWindow]);

  const [dismissedAlerts, setDismissedAlerts] = useState(() => new Set());
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [lastResponse, setLastResponse] = useState(null);
  const [lastStatus, setLastStatus] = useState(null);
  const [requestLog, setRequestLog] = useState([]);
  const [logFilters, setLogFilters] = useState({ service: "all", status: "all", search: "" });
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [services, setServices] = useState([]);
  const knownInstances = services.flatMap((svc) => svc.instances.map((i) => i.name));

  useEffect(() => {
    let cancelled = false;
    let intervalId = null;

    async function fetchServices() {
      try {
        const res = await fetch(`${API_BASE}/api/v1/services`);
        const data = await res.json();
        if (cancelled) return;
        setServices(parseServices(data));
      } catch {
        /* ignore */
      }
    }

    fetchServices();
    intervalId = setInterval(fetchServices, settings?.pollInterval || 1500);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [settings?.pollInterval]);

  async function sendTestRequest() {
    setSending(true);
    setSendError("");
    setLastResponse(null);
    setLastStatus(null);

    const start = Date.now();

    try {
      const res = await fetch(`${API_BASE}/api/v1/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route: "/orders",
          payload: { orderId: "123" },
        }),
      });

      const latency = Date.now() - start;
      const data = await res.json().catch(() => ({}));
      setLastStatus(res.status);
      setLastResponse(data);

      if (res.status === 429) {
        setSendError("Rate limited — too many requests. Try again shortly.");
      } else if (res.status >= 500) {
        setSendError(`Server error (${res.status}). The backend may be experiencing issues.`);
      } else if (!res.ok) {
        setSendError(data?.error || `Request failed with HTTP ${res.status}`);
      }
      setRequestLog((prev) =>
        [
          {
            id: data.requestId || crypto.randomUUID(),
            routedTo: data.routedTo || "—",
            status: res.status,
            latency,
            time: new Date().toLocaleTimeString(),
            response: data,
          },
          ...prev,
        ].slice(0, settings?.maxLogSize || 100)
      );
    } catch (e) {
      const latency = Date.now() - start;
      setLastStatus("network_error");
      setSendError(
        e.message === "Failed to fetch"
          ? "Cannot reach backend. Is the server running on " + API_BASE + "?"
          : e.message || "Request failed"
      );
      setRequestLog((prev) =>
        [
          {
            id: crypto.randomUUID().slice(0, 16),
            routedTo: "—",
            status: "error",
            latency,
            time: new Date().toLocaleTimeString(),
          },
          ...prev,
        ].slice(0, settings?.maxLogSize || 100)
      );
    } finally {
      setSending(false);
    }
  }

  const [simRunning, setSimRunning] = useState(null);
  const [simResults, setSimResults] = useState({ total: 0, success: 0, failed: 0, rateLimited: 0 });

  const SIMULATIONS = {
    normal: { label: "Normal Load", count: 10, delay: 200, route: "/orders" },
    spike: { label: "Traffic Spike", count: 50, delay: 50, route: "/orders" },
    abusive: { label: "Abusive Requests", count: 100, delay: 10, route: "/orders" },
  };

  async function runSimulation(type) {
    const sim = SIMULATIONS[type];
    setSimRunning(type);
    setSimResults({ total: 0, success: 0, failed: 0, rateLimited: 0 });

    const results = { total: 0, success: 0, failed: 0, rateLimited: 0 };

    for (let i = 0; i < sim.count; i++) {
      const start = Date.now();
      let entry = null;
      try {
        const res = await fetch(`${API_BASE}/api/v1/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            route: sim.route,
            payload: { simType: type, index: i },
          }),
        });

        const latency = Date.now() - start;
        const data = await res.json().catch(() => ({}));

        results.total++;
        if (res.status === 429) {
          results.rateLimited++;
        } else if (res.ok) {
          results.success++;
        } else {
          results.failed++;
        }

        entry = {
          id: data.requestId || crypto.randomUUID(),
          routedTo: data.routedTo || "—",
          status: res.status,
          latency,
          time: new Date().toLocaleTimeString(),
          response: data,
        };
      } catch {
        results.total++;
        results.failed++;
        entry = {
          id: crypto.randomUUID().slice(0, 16),
          routedTo: "—",
          status: "error",
          latency: Date.now() - start,
          time: new Date().toLocaleTimeString(),
        };
      }

      if (entry) {
        setRequestLog((prev) =>
          [entry, ...prev].slice(0, settings?.maxLogSize || 100)
        );
      }

      setSimResults({ ...results });

      if (sim.delay > 0) {
        await new Promise((r) => setTimeout(r, sim.delay));
      }
    }

    setSimRunning(null);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        {(() => {
          const alerts = findAlertingServices(requestLog, settings).filter(
            (a) => !dismissedAlerts.has(a.service)
          );
          if (alerts.length === 0) return null;
          return (
            <div
              role="alert"
              aria-label="Error rate alert"
              style={{
                marginBottom: 14,
                padding: "12px 16px",
                borderRadius: 10,
                border: "1px solid #fecaca",
                background: "#fef2f2",
                color: "#991b1b",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ fontSize: 13, lineHeight: 1.45 }}>
                <strong style={{ fontWeight: 700 }}>
                  Error rate above {settings.errorRateAlertPct}%
                </strong>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {alerts.map((a) => (
                    <li key={a.service}>
                      <code style={{ fontSize: 12 }}>{a.service}</code> —{" "}
                      {a.errorRatePct}% errors over last {a.total} requests
                    </li>
                  ))}
                </ul>
              </div>
              <button
                aria-label="Dismiss alert"
                onClick={() =>
                  setDismissedAlerts((prev) => {
                    const next = new Set(prev);
                    alerts.forEach((a) => next.add(a.service));
                    return next;
                  })
                }
                style={{
                  border: "1px solid #fecaca",
                  background: "transparent",
                  color: "#991b1b",
                  padding: "4px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                Dismiss
              </button>
            </div>
          );
        })()}
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 28 }}>EdgeForge Dashboard</h1>
          <p style={{ marginTop: 6, color: "var(--text-secondary)" }}>
            Sprint 2: Traffic simulation, request logging, and real-time
            charts.
          </p>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
          {/* Settings Panel */}
          <Card title="Settings">
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              style={{
                border: "1px solid var(--border)",
                background: "var(--bg-card)",
                padding: "6px 12px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 12,
                color: "var(--text-strong)",
                marginBottom: settingsOpen ? 12 : 0,
              }}
            >
              {settingsOpen ? "Hide Settings" : "Show Settings"}
            </button>
            {settingsOpen && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13 }}>
                <label>
                  Poll interval:{" "}
                  <select
                    aria-label="Poll interval"
                    value={settings.pollInterval}
                    onChange={(e) => updateSetting("pollInterval", Number(e.target.value))}
                    style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}
                  >
                    <option value={1000}>1s</option>
                    <option value={1500}>1.5s</option>
                    <option value={3000}>3s</option>
                  </select>
                </label>
                <label>
                  Max log entries:{" "}
                  <select
                    aria-label="Max log entries"
                    value={settings.maxLogSize}
                    onChange={(e) => updateSetting("maxLogSize", Number(e.target.value))}
                    style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}
                  >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </label>
                <label>
                  Chart history:{" "}
                  <select
                    aria-label="Chart history window"
                    value={settings.chartWindow}
                    onChange={(e) => updateSetting("chartWindow", Number(e.target.value))}
                    style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}
                  >
                    <option value={15}>15</option>
                    <option value={30}>30</option>
                    <option value={60}>60</option>
                  </select>
                </label>
                <label>
                  Theme:{" "}
                  <select
                    aria-label="Theme"
                    value={settings.theme}
                    onChange={(e) => updateSetting("theme", e.target.value)}
                    style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}
                  >
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    aria-label="Enable error rate alerts"
                    checked={!!settings.enableAlerts}
                    onChange={(e) => {
                      updateSetting("enableAlerts", e.target.checked);
                      if (e.target.checked) setDismissedAlerts(new Set());
                    }}
                  />
                  Enable alerts
                </label>
                <label>
                  Alert threshold:{" "}
                  <input
                    type="number"
                    aria-label="Error rate alert threshold"
                    min={1}
                    max={100}
                    value={settings.errorRateAlertPct}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n) && n >= 1 && n <= 100) {
                        updateSetting("errorRateAlertPct", n);
                        setDismissedAlerts(new Set());
                      }
                    }}
                    style={{ width: 60, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}
                  />
                  %
                </label>
              </div>
            )}
          </Card>

          {/* Health Indicator */}
          <Card title="Backend Health">
            <div
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background:
                    health.state === "up"
                      ? "#22c55e"
                      : health.state === "down"
                        ? "#ef4444"
                        : "#9ca3af",
                }}
              />
              <span style={{ fontWeight: 700 }}>{health.message}</span>
            </div>
            <div
              style={{ marginTop: 10, color: "var(--text-secondary)", fontSize: 13 }}
            >
              {API_BASE} <span style={{ marginLeft: 8 }}>|</span>{" "}
              <code>GET /health</code>
            </div>
          </Card>

          {/* Stats Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 12,
            }}
          >
            <Card title="Uptime (sec)">
              <div style={{ fontSize: 20 }}>{status.uptimeSec}</div>
            </Card>
            <Card title="Requests Total">
              <div style={{ fontSize: 20 }}>{status.requestsTotal}</div>
            </Card>
            <Card title="Errors Total">
              <div style={{ fontSize: 20 }}>{status.errorsTotal}</div>
            </Card>
            <Card title="Rate Limited">
              <div style={{ fontSize: 20 }}>{status.rateLimitedTotal}</div>
            </Card>
            <Card title="Active Sims">
              <div style={{ fontSize: 20 }}>{status.activeSimulations}</div>
            </Card>
          </div>

          {/* Send Test Request */}
          <Card title="Send Test Request">
            <p style={{ marginTop: 0, color: "var(--text-secondary)" }}>
              Sends a request to the gateway to simulate routing. Endpoint:{" "}
              <code>POST /api/v1/request</code>
            </p>

            <button
              style={{
                border: "1px solid #111827",
                background: sending ? "#374151" : "#111827",
                color: "white",
                padding: "10px 14px",
                borderRadius: 10,
                cursor: sending ? "not-allowed" : "pointer",
                opacity: sending ? 0.85 : 1,
              }}
              onClick={sendTestRequest}
              disabled={sending}
            >
              {sending ? "Sending..." : "Send Test Request"}
            </button>

            {sendError && (
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: 14,
                  background:
                    lastStatus === 429
                      ? "#fffbeb"
                      : lastStatus === "network_error"
                        ? "#f3f4f6"
                        : "#fef2f2",
                  color:
                    lastStatus === 429
                      ? "#92400e"
                      : lastStatus === "network_error"
                        ? "#374151"
                        : "#b91c1c",
                }}
              >
                {lastStatus === 429 ? "Rate Limited: " : lastStatus === "network_error" ? "Offline: " : "Error: "}
                {sendError}
              </div>
            )}

            {lastResponse?.requestId && !sendError && (
              <div style={{ marginTop: 10, color: "#065f46", fontSize: 14 }}>
                requestId: <code>{lastResponse.requestId}</code>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-strong)",
                  marginBottom: 6,
                }}
              >
                Last Response
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  borderRadius: 10,
                  background: "var(--bg-code)",
                  color: "var(--text-on-code)",
                  overflowX: "auto",
                  minHeight: 70,
                }}
              >
                {lastResponse
                  ? JSON.stringify(lastResponse, null, 2)
                  : "—"}
              </pre>
            </div>
          </Card>

          {/* Traffic Simulation */}
          <Card title="Traffic Simulation">
            <p style={{ marginTop: 0, color: "var(--text-secondary)" }}>
              Send bulk requests to simulate different traffic patterns.
            </p>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {Object.entries(SIMULATIONS).map(([type, sim]) => (
                <button
                  key={type}
                  style={{
                    border: "1px solid #111827",
                    background:
                      simRunning === type
                        ? "#374151"
                        : type === "abusive"
                          ? "#b91c1c"
                          : type === "spike"
                            ? "#d97706"
                            : "#111827",
                    color: "white",
                    padding: "10px 14px",
                    borderRadius: 10,
                    cursor: simRunning ? "not-allowed" : "pointer",
                    opacity: simRunning && simRunning !== type ? 0.5 : 1,
                  }}
                  onClick={() => runSimulation(type)}
                  disabled={!!simRunning}
                >
                  {simRunning === type
                    ? `Running... (${simResults.total}/${sim.count})`
                    : `${sim.label} (${sim.count} reqs)`}
                </button>
              ))}
            </div>

            {simResults.total > 0 && (
              <div
                style={{
                  marginTop: 14,
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 10,
                }}
              >
                <div style={{ padding: 10, background: "var(--bg-muted)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Total</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{simResults.total}</div>
                </div>
                <div style={{ padding: 10, background: "#ecfdf5", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "#065f46" }}>Success</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#22c55e" }}>{simResults.success}</div>
                </div>
                <div style={{ padding: 10, background: "#fef2f2", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "#b91c1c" }}>Failed</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#ef4444" }}>{simResults.failed}</div>
                </div>
                <div style={{ padding: 10, background: "#fffbeb", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "#92400e" }}>Rate Limited</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#d97706" }}>{simResults.rateLimited}</div>
                </div>
              </div>
            )}
          </Card>

          {/* Live Request Log */}
          <Card title={`Live Request Log (${requestLog.length})`}>
            {(() => {
              const visibleLog = filterRequestLog(requestLog, logFilters);
              const uniqueServices = Array.from(
                new Set([
                  ...knownInstances,
                  ...requestLog.map((e) => e.routedTo).filter((s) => s && s !== "—"),
                ])
              );
              return (
                <>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      marginBottom: 10,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      Filter by service:{" "}
                      <select
                        aria-label="Filter by service"
                        value={logFilters.service}
                        onChange={(e) =>
                          setLogFilters({ ...logFilters, service: e.target.value })
                        }
                        style={{
                          marginLeft: 4,
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          fontSize: 12,
                        }}
                      >
                        <option value="all">All</option>
                        {uniqueServices.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      Status:{" "}
                      <select
                        aria-label="Filter by status"
                        value={logFilters.status}
                        onChange={(e) =>
                          setLogFilters({ ...logFilters, status: e.target.value })
                        }
                        style={{
                          marginLeft: 4,
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          fontSize: 12,
                        }}
                      >
                        <option value="all">All</option>
                        <option value="success">Success (2xx)</option>
                        <option value="rateLimited">Rate Limited (429)</option>
                        <option value="error">Error</option>
                      </select>
                    </label>
                    <input
                      type="text"
                      aria-label="Search request id"
                      placeholder="Search request id..."
                      value={logFilters.search}
                      onChange={(e) =>
                        setLogFilters({ ...logFilters, search: e.target.value })
                      }
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        fontSize: 12,
                        flex: "1 1 160px",
                        minWidth: 120,
                      }}
                    />
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      Showing {visibleLog.length} of {requestLog.length}
                    </span>
                  </div>
            <div
              style={{
                maxHeight: 300,
                overflowY: "auto",
                borderRadius: 8,
                border: "1px solid var(--border)",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "var(--bg-header-row)",
                      position: "sticky",
                      top: 0,
                    }}
                  >
                    <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Time</th>
                    <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Request ID</th>
                    <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Routed To</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>Status</th>
                    <th style={{ padding: "8px 10px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLog.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          padding: 20,
                          textAlign: "center",
                          color: "var(--text-muted)",
                        }}
                      >
                        {requestLog.length === 0
                          ? "No requests yet. Send a test request to see logs here."
                          : "No requests match the current filters."}
                      </td>
                    </tr>
                  ) : (
                    visibleLog.map((entry, i) => (
                      <tr
                        key={i}
                        onClick={() => setSelectedRequest(entry)}
                        style={{ borderBottom: "1px solid var(--border-soft)", cursor: "pointer" }}
                      >
                        <td style={{ padding: "6px 10px", color: "var(--text-secondary)" }}>{entry.time}</td>
                        <td style={{ padding: "6px 10px" }}>
                          <code style={{ fontSize: 12 }}>{entry.id}</code>
                        </td>
                        <td style={{ padding: "6px 10px" }}>{entry.routedTo}</td>
                        <td style={{ padding: "6px 10px", textAlign: "center" }}>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              background:
                                entry.status === 200
                                  ? "#ecfdf5"
                                  : entry.status === 429
                                    ? "#fffbeb"
                                    : "#fef2f2",
                              color:
                                entry.status === 200
                                  ? "#065f46"
                                  : entry.status === 429
                                    ? "#92400e"
                                    : "#b91c1c",
                            }}
                          >
                            {entry.status}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "6px 10px",
                            textAlign: "right",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {entry.latency}ms
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              {requestLog.length > 0 && (
                <button
                  onClick={() => setRequestLog([])}
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--bg-card)",
                    padding: "6px 12px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 12,
                    color: "var(--text-secondary)",
                  }}
                >
                  Clear Log
                </button>
              )}
              <button
                onClick={() => {
                  const csv = toCsv(requestLog);
                  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `edgeforge-requests-${Date.now()}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                disabled={requestLog.length === 0}
                style={{
                  border: "1px solid var(--border)",
                  background: requestLog.length === 0 ? "var(--bg-muted)" : "var(--bg-card)",
                  padding: "6px 12px",
                  borderRadius: 8,
                  cursor: requestLog.length === 0 ? "not-allowed" : "pointer",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  opacity: requestLog.length === 0 ? 0.6 : 1,
                }}
              >
                Export CSV
              </button>
            </div>
                </>
              );
            })()}
          </Card>

          {/* Services Status (with circuit breaker state) */}
          <Card title="Services Status">
            {services.length === 0 ? (
              <div style={{ color: "var(--text-secondary)", fontSize: 13, padding: "8px 0" }}>
                Waiting for backend service registry...
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {services.map((svc) => (
                  <div key={svc.service}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)", marginBottom: 6 }}>
                      {svc.service}{" "}
                      <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>
                        — {svc.requests} request{svc.requests === 1 ? "" : "s"}
                      </span>
                    </div>
                    <ul aria-label={`${svc.service} instances`} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                      {svc.instances.map((inst) => {
                        const badge = breakerBadge(inst.breaker);
                        return (
                          <li
                            key={inst.name}
                            data-instance-name={inst.name}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              padding: "8px 10px",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                          >
                            <span
                              aria-label={inst.healthy ? "healthy" : "unhealthy"}
                              title={inst.healthy ? "healthy" : "unhealthy"}
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 999,
                                background: inst.healthy ? "#22c55e" : "#ef4444",
                                flexShrink: 0,
                              }}
                            />
                            <code style={{ flex: "1 1 auto" }}>{inst.name}</code>
                            <span
                              data-testid={`breaker-${inst.name}`}
                              aria-label={`circuit breaker ${badge.label}`}
                              style={{
                                padding: "2px 8px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 600,
                                background: badge.bg,
                                color: badge.color,
                                border: `1px solid ${badge.border}`,
                              }}
                            >
                              {badge.label}
                            </span>
                            <span style={{ color: "var(--text-secondary)" }}>
                              active {inst.activeRequests}
                            </span>
                            <span style={{ color: "var(--text-secondary)" }}>
                              fail {inst.failures}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Per-Service Metrics */}
          <Card title="Per-Service Metrics">
            {requestLog.length === 0 ? (
              <div style={{ color: "var(--text-secondary)", fontSize: 13, padding: "8px 0" }}>
                Send requests to see per-service breakdown.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--text-secondary)" }}>
                      <th style={{ padding: "6px 8px" }}>Service</th>
                      <th style={{ padding: "6px 8px" }}>Total</th>
                      <th style={{ padding: "6px 8px" }}>Success</th>
                      <th style={{ padding: "6px 8px" }}>Rate Limited</th>
                      <th style={{ padding: "6px 8px" }}>Errors</th>
                      <th style={{ padding: "6px 8px" }}>Avg Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregateByService(requestLog).map((row) => (
                      <tr key={row.service} style={{ borderTop: "1px solid var(--border-soft)" }}>
                        <td style={{ padding: "8px", fontWeight: 600 }}>{row.service}</td>
                        <td style={{ padding: "8px" }}>{row.total}</td>
                        <td style={{ padding: "8px", color: "#16a34a" }}>{row.success}</td>
                        <td style={{ padding: "8px", color: "#d97706" }}>{row.rateLimited}</td>
                        <td style={{ padding: "8px", color: "#b91c1c" }}>{row.errors}</td>
                        <td style={{ padding: "8px" }}>{row.avgLatency}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Real-Time Charts */}
          <Card title="Requests / sec">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={metricsHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="reqsPerSec"
                  name="Requests/s"
                  stroke="#3b82f6"
                  fill="#dbeafe"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
          >
            <Card title="Errors / sec">
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={metricsHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="errsPerSec"
                    name="Errors/s"
                    stroke="#ef4444"
                    fill="#fef2f2"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Rate Limited / sec">
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={metricsHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="rlPerSec"
                    name="Rate Limited/s"
                    stroke="#d97706"
                    fill="#fffbeb"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </div>
      </div>

      {selectedRequest && (
        <div
          role="dialog"
          aria-label="Request details"
          onClick={() => setSelectedRequest(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--modal-overlay)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg-card)",
              borderRadius: 12,
              padding: 24,
              maxWidth: 600,
              width: "100%",
              maxHeight: "80vh",
              overflowY: "auto",
              boxShadow: "var(--shadow-modal)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Request Details</h3>
              <button
                onClick={() => setSelectedRequest(null)}
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--bg-card)",
                  padding: "6px 12px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Close
              </button>
            </div>
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              <div><strong>Time:</strong> {selectedRequest.time}</div>
              <div><strong>Request ID:</strong> <code>{selectedRequest.id}</code></div>
              <div><strong>Routed To:</strong> {selectedRequest.routedTo}</div>
              <div><strong>Status:</strong> {selectedRequest.status}</div>
              <div><strong>Latency:</strong> {selectedRequest.latency}ms</div>
            </div>
            <button
              onClick={() => navigator.clipboard?.writeText(selectedRequest.id)}
              style={{
                border: "1px solid #111827",
                background: "#111827",
                color: "white",
                padding: "6px 12px",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              Copy Request ID
            </button>
            {(() => {
              const trace = parseTrace(selectedRequest);
              if (trace.length === 0) return null;
              return (
                <div aria-label="Request trace timeline" style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-strong)", marginBottom: 8 }}>
                    Trace ({trace.length} {trace.length === 1 ? "attempt" : "attempts"})
                  </div>
                  <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    {trace.map((step, idx) => {
                      const isSuccess = step.outcome === "success";
                      const isFail = step.outcome === "fail";
                      const pillBg = isSuccess ? "#ecfdf5" : isFail ? "#fef2f2" : "#fffbeb";
                      const pillColor = isSuccess ? "#065f46" : isFail ? "#b91c1c" : "#92400e";
                      return (
                        <li
                          key={idx}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 10px",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            fontSize: 12,
                          }}
                        >
                          <span
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 999,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "var(--bg-muted)",
                              color: "var(--text-strong)",
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {step.attempt}
                          </span>
                          <code style={{ flex: "0 0 auto" }}>{step.instance}</code>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              background: pillBg,
                              color: pillColor,
                            }}
                          >
                            {step.outcome}
                          </span>
                          {step.latencyMs !== null && (
                            <span style={{ color: "var(--text-secondary)" }}>
                              {step.latencyMs}ms
                            </span>
                          )}
                          {step.error && (
                            <span style={{ color: "#b91c1c", marginLeft: "auto", fontSize: 11 }}>
                              {step.error}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })()}
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-strong)", marginBottom: 6 }}>Response</div>
            <pre
              style={{
                margin: 0,
                padding: 12,
                borderRadius: 8,
                background: "var(--bg-code)",
                color: "var(--text-on-code)",
                fontSize: 12,
                overflowX: "auto",
                maxHeight: 300,
              }}
            >
              {selectedRequest.response
                ? JSON.stringify(selectedRequest.response, null, 2)
                : "No response data captured."}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

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
import { aggregateByService, filterRequestLog } from "../utils/metrics";

function Card({ title, children }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        background: "white",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          fontSize: 14,
          color: "#374151",
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
    intervalId = setInterval(fetchStatus, 1500);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);
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
      [...prev, { time: now, reqsPerSec, errsPerSec, rlPerSec }].slice(-30)
    );
  }, [status]);

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [lastResponse, setLastResponse] = useState(null);
  const [lastStatus, setLastStatus] = useState(null);
  const [requestLog, setRequestLog] = useState([]);
  const [logFilters, setLogFilters] = useState({ service: "all", status: "all", search: "" });
  const [selectedRequest, setSelectedRequest] = useState(null);

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
        ].slice(0, 100)
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
        ].slice(0, 100)
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
      try {
        const res = await fetch(`${API_BASE}/api/v1/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            route: sim.route,
            payload: { simType: type, index: i },
          }),
        });

        results.total++;
        if (res.status === 429) {
          results.rateLimited++;
        } else if (res.ok) {
          results.success++;
        } else {
          results.failed++;
        }
      } catch {
        results.total++;
        results.failed++;
      }

      setSimResults({ ...results });

      if (sim.delay > 0) {
        await new Promise((r) => setTimeout(r, sim.delay));
      }
    }

    setSimRunning(null);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 28 }}>EdgeForge Dashboard</h1>
          <p style={{ marginTop: 6, color: "#6b7280" }}>
            Sprint 2: Traffic simulation, request logging, and real-time
            charts.
          </p>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
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
              style={{ marginTop: 10, color: "#6b7280", fontSize: 13 }}
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
            <p style={{ marginTop: 0, color: "#6b7280" }}>
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
                  color: "#374151",
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
                  background: "#111827",
                  color: "#e5e7eb",
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
            <p style={{ marginTop: 0, color: "#6b7280" }}>
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
                <div style={{ padding: 10, background: "#f3f4f6", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Total</div>
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
                new Set(requestLog.map((e) => e.routedTo).filter((s) => s && s !== "—"))
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
                    <label style={{ fontSize: 12, color: "#6b7280" }}>
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
                          border: "1px solid #e5e7eb",
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
                    <label style={{ fontSize: 12, color: "#6b7280" }}>
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
                          border: "1px solid #e5e7eb",
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
                        border: "1px solid #e5e7eb",
                        fontSize: 12,
                        flex: "1 1 160px",
                        minWidth: 120,
                      }}
                    />
                    <span style={{ fontSize: 12, color: "#6b7280" }}>
                      Showing {visibleLog.length} of {requestLog.length}
                    </span>
                  </div>
            <div
              style={{
                maxHeight: 300,
                overflowY: "auto",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
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
                      background: "#f9fafb",
                      position: "sticky",
                      top: 0,
                    }}
                  >
                    <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>Time</th>
                    <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>Request ID</th>
                    <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>Routed To</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", borderBottom: "1px solid #e5e7eb" }}>Status</th>
                    <th style={{ padding: "8px 10px", textAlign: "right", borderBottom: "1px solid #e5e7eb" }}>Latency</th>
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
                          color: "#9ca3af",
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
                        style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
                      >
                        <td style={{ padding: "6px 10px", color: "#6b7280" }}>{entry.time}</td>
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
                            color: "#6b7280",
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
            {requestLog.length > 0 && (
              <button
                onClick={() => setRequestLog([])}
                style={{
                  marginTop: 10,
                  border: "1px solid #e5e7eb",
                  background: "white",
                  padding: "6px 12px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 12,
                  color: "#6b7280",
                }}
              >
                Clear Log
              </button>
            )}
                </>
              );
            })()}
          </Card>

          {/* Per-Service Metrics */}
          <Card title="Per-Service Metrics">
            {requestLog.length === 0 ? (
              <div style={{ color: "#6b7280", fontSize: 13, padding: "8px 0" }}>
                Send requests to see per-service breakdown.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#6b7280" }}>
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
                      <tr key={row.service} style={{ borderTop: "1px solid #f3f4f6" }}>
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
            background: "rgba(0,0,0,0.5)",
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
              background: "white",
              borderRadius: 12,
              padding: 24,
              maxWidth: 600,
              width: "100%",
              maxHeight: "80vh",
              overflowY: "auto",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Request Details</h3>
              <button
                onClick={() => setSelectedRequest(null)}
                style={{
                  border: "1px solid #e5e7eb",
                  background: "white",
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
            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Response</div>
            <pre
              style={{
                margin: 0,
                padding: 12,
                borderRadius: 8,
                background: "#111827",
                color: "#e5e7eb",
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

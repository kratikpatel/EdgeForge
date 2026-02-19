import { useEffect, useState } from "react";
import { API_BASE } from "../config";

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

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [lastResponse, setLastResponse] = useState(null);

  async function sendTestRequest() {
    setSending(true);
    setSendError("");
    setLastResponse(null);

    try {
      const res = await fetch(`${API_BASE}/api/v1/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route: "/orders",
          payload: { orderId: "123" },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      setLastResponse(data);
    } catch (e) {
      setSendError(e.message || "Request failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 28 }}>EdgeForge Dashboard</h1>
          <p style={{ marginTop: 6, color: "#6b7280" }}>
            Sprint 1: Health check, status polling, and request trigger.
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
              <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 14 }}>
                Error: {sendError}
              </div>
            )}

            {lastResponse?.requestId && (
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
        </div>
      </div>
    </div>
  );
}

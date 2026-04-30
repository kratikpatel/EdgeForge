import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Dashboard from "./Dashboard";

vi.mock("recharts", () => ({
  AreaChart: ({ children }) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}));

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Dashboard", () => {
  it("renders the dashboard title", () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok" }),
    });
    render(<Dashboard />);
    expect(screen.getByText("EdgeForge Dashboard")).toBeInTheDocument();
  });

  it("shows loading state initially for health", () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok" }),
    });
    render(<Dashboard />);
    expect(screen.getByText("Checking...")).toBeInTheDocument();
  });

  it('shows "UP" when health check succeeds', async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok" }),
    });
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("UP")).toBeInTheDocument();
    });
  });

  it('shows "DOWN" when health check fails', async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("DOWN")).toBeInTheDocument();
    });
  });

  it("renders all 5 stats cards", () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok" }),
    });
    render(<Dashboard />);
    expect(screen.getByText("Uptime (sec)")).toBeInTheDocument();
    expect(screen.getByText("Requests Total")).toBeInTheDocument();
    expect(screen.getByText("Errors Total")).toBeInTheDocument();
    expect(screen.getByText("Rate Limited")).toBeInTheDocument();
    expect(screen.getByText("Active Sims")).toBeInTheDocument();
  });

  it("renders the Send Test Request button", () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok" }),
    });
    render(<Dashboard />);
    expect(screen.getByRole("button", { name: "Send Test Request" })).toBeInTheDocument();
  });

  it("disables button while sending", async () => {
    let resolveFetch;
    vi.spyOn(global, "fetch").mockImplementation((url) => {
      if (url.includes("/api/v1/request")) {
        return new Promise((resolve) => { resolveFetch = resolve; });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
    });
    render(<Dashboard />);
    fireEvent.click(screen.getByRole("button", { name: "Send Test Request" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
    });
    resolveFetch({ ok: true, status: 200, json: async () => ({ requestId: "abc123", routedTo: "mock-orders-service", status: "success" }) });
  });

  it("displays response after successful request", async () => {
    vi.spyOn(global, "fetch").mockImplementation((url) => {
      if (url.includes("/api/v1/request")) {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => ({ requestId: "test-id-123", routedTo: "mock-orders-service", status: "success" }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
    });
    render(<Dashboard />);
    fireEvent.click(screen.getByRole("button", { name: "Send Test Request" }));
    await waitFor(() => {
      expect(screen.getAllByText(/test-id-123/).length).toBeGreaterThan(0);
    });
  });

  it("shows rate limit error for 429 response", async () => {
    vi.spyOn(global, "fetch").mockImplementation((url) => {
      if (url.includes("/api/v1/request")) {
        return Promise.resolve({ ok: false, status: 429, json: async () => ({ error: "rate_limited" }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
    });
    render(<Dashboard />);
    fireEvent.click(screen.getByRole("button", { name: "Send Test Request" }));
    await waitFor(() => {
      expect(screen.getByText(/Rate Limited:.*too many requests/i)).toBeInTheDocument();
    });
  });

  it("shows network error when fetch fails", async () => {
    vi.spyOn(global, "fetch").mockImplementation((url) => {
      if (url.includes("/api/v1/request")) {
        return Promise.reject(new Error("Failed to fetch"));
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
    });
    render(<Dashboard />);
    fireEvent.click(screen.getByRole("button", { name: "Send Test Request" }));
    await waitFor(() => {
      expect(screen.getByText(/Cannot reach backend/)).toBeInTheDocument();
    });
  });

  it("renders chart cards", () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ status: "ok" }),
    });
    render(<Dashboard />);
    expect(screen.getByText("Requests / sec")).toBeInTheDocument();
    expect(screen.getByText("Errors / sec")).toBeInTheDocument();
    expect(screen.getByText("Rate Limited / sec")).toBeInTheDocument();
  });

  it("renders per-service metrics panel with empty state", () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ status: "ok" }),
    });
    render(<Dashboard />);
    expect(screen.getByText("Per-Service Metrics")).toBeInTheDocument();
    expect(
      screen.getByText("Send requests to see per-service breakdown.")
    ).toBeInTheDocument();
  });

  it("renders request log filter controls", () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ status: "ok" }),
    });
    render(<Dashboard />);
    expect(screen.getByLabelText("Filter by service")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by status")).toBeInTheDocument();
    expect(screen.getByLabelText("Search request id")).toBeInTheDocument();
    expect(screen.getByText(/Showing 0 of 0/)).toBeInTheDocument();
  });

  it("does not render the request details modal by default", () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ status: "ok" }),
    });
    render(<Dashboard />);
    expect(screen.queryByRole("dialog", { name: "Request details" })).not.toBeInTheDocument();
  });

  it("renders Export CSV button disabled when log is empty", () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ status: "ok" }),
    });
    render(<Dashboard />);
    const btn = screen.getByText("Export CSV");
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it("renders the Settings panel", () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ status: "ok" }),
    });
    render(<Dashboard />);
    expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
    expect(screen.getByText("Show Settings")).toBeInTheDocument();
  });

  it("applies a theme attribute on documentElement on mount", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ status: "ok" }),
    });
    document.documentElement.removeAttribute("data-theme");
    render(<Dashboard />);
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toMatch(/light|dark/);
    });
  });

  it("flips data-theme to dark when the theme select is set to Dark", async () => {
    localStorage.clear();
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ status: "ok" }),
    });
    render(<Dashboard />);
    fireEvent.click(screen.getByText("Show Settings"));
    const themeSelect = screen.getByLabelText("Theme");
    fireEvent.change(themeSelect, { target: { value: "dark" } });
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
  });

  it("renders enable-alerts checkbox and threshold input in settings", () => {
    localStorage.clear();
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ status: "ok" }),
    });
    render(<Dashboard />);
    fireEvent.click(screen.getByText("Show Settings"));
    expect(screen.getByLabelText("Enable error rate alerts")).toBeInTheDocument();
    expect(screen.getByLabelText("Error rate alert threshold")).toBeInTheDocument();
  });

  it("does not render the alert banner when there are no errors", () => {
    localStorage.clear();
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ status: "ok" }),
    });
    render(<Dashboard />);
    expect(screen.queryByRole("alert", { name: "Error rate alert" })).not.toBeInTheDocument();
  });

  it("shows the alert banner when error rate crosses the threshold", async () => {
    localStorage.clear();
    let callIdx = 0;
    vi.spyOn(global, "fetch").mockImplementation((url) => {
      if (url.includes("/api/v1/request")) {
        callIdx++;
        return Promise.resolve({
          ok: false, status: 500,
          json: async () => ({ requestId: `req-${callIdx}`, routedTo: "orders-1" }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
    });
    render(<Dashboard />);
    const sendBtn = screen.getByRole("button", { name: "Send Test Request" });
    for (let i = 0; i < 3; i++) {
      fireEvent.click(sendBtn);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Send Test Request" })).not.toBeDisabled();
      });
    }
    await waitFor(() => {
      expect(screen.getByRole("alert", { name: "Error rate alert" })).toBeInTheDocument();
    });
    expect(screen.getByText(/Error rate above 10%/i)).toBeInTheDocument();
  });

  it("renders the Services Status panel with breaker badges from /api/v1/services", async () => {
    localStorage.clear();
    vi.spyOn(global, "fetch").mockImplementation((url) => {
      if (url.includes("/api/v1/services")) {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => ({
            orders: {
              requests: 5,
              instances: [
                { name: "orders-service-1", url: "http://localhost:9001", healthy: true, activeRequests: 0, requests: 3, failures: 1, breaker: "closed" },
                { name: "orders-service-2", url: "http://localhost:9002", healthy: false, activeRequests: 0, requests: 2, failures: 5, breaker: "open" },
              ],
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
    });
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByTestId("breaker-orders-service-1")).toHaveTextContent("closed");
      expect(screen.getByTestId("breaker-orders-service-2")).toHaveTextContent("open");
    });
    expect(screen.getByLabelText("orders instances")).toBeInTheDocument();
  });

  it("shows '—' breaker badge when backend has not yet returned breaker state", async () => {
    localStorage.clear();
    vi.spyOn(global, "fetch").mockImplementation((url) => {
      if (url.includes("/api/v1/services")) {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => ({
            orders: {
              requests: 0,
              instances: [{ name: "orders-service-1", url: "http://localhost:9001", healthy: true }],
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
    });
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByTestId("breaker-orders-service-1")).toHaveTextContent("—");
    });
  });

  it("renders the trace timeline in the request detail modal when trace is present", async () => {
    localStorage.clear();
    vi.spyOn(global, "fetch").mockImplementation((url) => {
      if (url.includes("/api/v1/request")) {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => ({
            requestId: "trace-req-1",
            routedTo: "orders-service-2",
            status: "success",
            trace: [
              { attempt: 1, instance: "orders-service-1", status: "fail", latencyMs: 120, error: "connection refused" },
              { attempt: 2, instance: "orders-service-2", status: "success", latencyMs: 30 },
            ],
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
    });
    render(<Dashboard />);
    fireEvent.click(screen.getByRole("button", { name: "Send Test Request" }));
    await waitFor(() => {
      expect(screen.getAllByText("orders-service-2").length).toBeGreaterThan(0);
    });
    const row = screen.getAllByText("orders-service-2").find((el) => el.tagName === "TD");
    fireEvent.click(row);
    expect(screen.getByLabelText("Request trace timeline")).toBeInTheDocument();
    expect(screen.getByText(/Trace \(2 attempts\)/i)).toBeInTheDocument();
    expect(screen.getByText("connection refused")).toBeInTheDocument();
  });

  it("does not render the trace section when the response has no trace", async () => {
    localStorage.clear();
    vi.spyOn(global, "fetch").mockImplementation((url) => {
      if (url.includes("/api/v1/request")) {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => ({ requestId: "no-trace", routedTo: "orders-service-1", status: "success" }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
    });
    render(<Dashboard />);
    fireEvent.click(screen.getByRole("button", { name: "Send Test Request" }));
    await waitFor(() => {
      expect(screen.getAllByText("orders-service-1").length).toBeGreaterThan(0);
    });
    const row = screen.getAllByText("orders-service-1").find((el) => el.tagName === "TD");
    fireEvent.click(row);
    expect(screen.queryByLabelText("Request trace timeline")).not.toBeInTheDocument();
  });

  it("dismisses the alert banner when Dismiss is clicked", async () => {
    localStorage.clear();
    let callIdx = 0;
    vi.spyOn(global, "fetch").mockImplementation((url) => {
      if (url.includes("/api/v1/request")) {
        callIdx++;
        return Promise.resolve({
          ok: false, status: 500,
          json: async () => ({ requestId: `req-${callIdx}`, routedTo: "orders-1" }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
    });
    render(<Dashboard />);
    const sendBtn = screen.getByRole("button", { name: "Send Test Request" });
    for (let i = 0; i < 3; i++) {
      fireEvent.click(sendBtn);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Send Test Request" })).not.toBeDisabled();
      });
    }
    await waitFor(() => {
      expect(screen.getByRole("alert", { name: "Error rate alert" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText("Dismiss alert"));
    expect(screen.queryByRole("alert", { name: "Error rate alert" })).not.toBeInTheDocument();
  });

  it("renders the Chaos Controls panel with empty state", () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ status: "ok" }),
    });
    render(<Dashboard />);
    expect(screen.getByText("Chaos Controls")).toBeInTheDocument();
    expect(
      screen.getByText(/Waiting for services\. Make sure the gateway is running\./)
    ).toBeInTheDocument();
  });
});

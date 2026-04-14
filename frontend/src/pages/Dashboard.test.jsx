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
});

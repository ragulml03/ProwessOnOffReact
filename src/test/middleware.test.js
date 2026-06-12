import { vi, describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";

// vi.hoisted creates stable mock references available inside vi.mock() factories
// AND inside test code — even after vi.resetModules() re-imports the module.
const { mockNext, mockInitializeAsync, mockCheckGate, mockGet, mockGetExperiment, MockStatsigClient } =
  vi.hoisted(() => {
    const mockNext = vi.fn(() => new Response());
    const mockGet = vi.fn((key, def) => (key === "variation" ? "challenger" : def));
    const mockGetExperiment = vi.fn(() => ({ get: mockGet }));
    const mockInitializeAsync = vi.fn(() => Promise.resolve());
    const mockCheckGate = vi.fn(() => false);
    const MockStatsigClient = vi.fn(function () {
      this.initializeAsync = mockInitializeAsync;
      this.checkGate = mockCheckGate;
      this.getExperiment = mockGetExperiment;
    });
    return { mockNext, mockGet, mockGetExperiment, mockInitializeAsync, mockCheckGate, MockStatsigClient };
  });

vi.mock("@vercel/edge", () => ({ next: mockNext }));
vi.mock("@statsig/js-client", () => ({ StatsigClient: MockStatsigClient }));

global.fetch = vi.fn(() => Promise.resolve({ ok: true }));
vi.spyOn(global.crypto, "randomUUID").mockReturnValue("test-uuid-fixed");

// Set env vars before the middleware module loads (they are read at module init time)
process.env.VITE_STATSIG_CLIENT_KEY = "test-client-key";
process.env.NEW_RELIC_LICENSE_KEY   = "test-nr-key";
process.env.NEW_RELIC_ACCOUNT_ID    = "12345";
process.env.KILL_SWITCH_CAREERS     = "false";
process.env.KILL_SWITCH_PROFILE     = "false";

// Import middleware after env vars + mocks are set up
const { default: middleware } = await import("../../middleware.js");

function makeRequest(path, cookies = "") {
  return {
    url: `https://prowess-on-off-react.vercel.app${path}`,
    headers: { get: (name) => (name === "cookie" ? cookies : null) },
  };
}

function getSetCookies(call) {
  const headers = call?.[0]?.headers;
  if (!headers) return [];
  const cookies = [];
  for (const [k, v] of headers.entries()) {
    if (k.toLowerCase() === "set-cookie") cookies.push(v);
  }
  return cookies;
}

// ─── Pass-through for non-experiment paths ───────────────────────────────────
describe("path routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNext.mockReturnValue(new Response());
  });

  it("passes through root path without Statsig call", async () => {
    await middleware(makeRequest("/"));
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockInitializeAsync).not.toHaveBeenCalled();
  });

  it("passes through /about without Statsig call", async () => {
    await middleware(makeRequest("/about"));
    expect(mockInitializeAsync).not.toHaveBeenCalled();
  });

  it("passes through /app/home without Statsig call", async () => {
    await middleware(makeRequest("/app/home"));
    expect(mockInitializeAsync).not.toHaveBeenCalled();
  });
});

// ─── Skip when cookie already exists ─────────────────────────────────────────
describe("cookie-already-set skip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNext.mockReturnValue(new Response());
  });

  it("skips Statsig when statsig_exp_careers cookie exists", async () => {
    await middleware(makeRequest("/app/careers", "statsig_exp_careers=challenger"));
    expect(mockInitializeAsync).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledWith(); // no Set-Cookie headers
  });

  it("skips Statsig when statsig_exp_profile cookie exists", async () => {
    await middleware(makeRequest("/app/profile", "statsig_exp_profile=control"));
    expect(mockInitializeAsync).not.toHaveBeenCalled();
  });
});

// ─── Normal assignment flow ───────────────────────────────────────────────────
describe("normal assignment — new user", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNext.mockReturnValue(new Response());
    mockGet.mockImplementation((key, def) => (key === "variation" ? "challenger" : def));
    mockCheckGate.mockReturnValue(false);
  });

  it("calls Statsig initializeAsync for /app/careers with no cookie", async () => {
    await middleware(makeRequest("/app/careers"));
    expect(mockInitializeAsync).toHaveBeenCalledTimes(1);
  });

  it("calls getExperiment with the correct experiment name", async () => {
    await middleware(makeRequest("/app/careers"));
    expect(mockGetExperiment).toHaveBeenCalledWith("careers_experiment");
  });

  it("sets variant cookie in the response headers", async () => {
    await middleware(makeRequest("/app/careers"));
    const cookies = getSetCookies(mockNext.mock.calls[0]);
    expect(cookies.some((c) => c.includes("statsig_exp_careers=challenger"))).toBe(true);
  });

  it("also sets statsig_user_id cookie for a brand-new anonymous user", async () => {
    await middleware(makeRequest("/app/careers"));
    const cookies = getSetCookies(mockNext.mock.calls[0]);
    expect(cookies.some((c) => c.includes("statsig_user_id=test-uuid-fixed"))).toBe(true);
  });

  it("does NOT set a new statsig_user_id when one already exists", async () => {
    await middleware(makeRequest("/app/careers", "statsig_user_id=existing-id"));
    const cookies = getSetCookies(mockNext.mock.calls[0]);
    expect(cookies.some((c) => c.includes("statsig_user_id=test-uuid-fixed"))).toBe(false);
  });

  it("pushes edge_flag_assignment log to New Relic with correct fields", async () => {
    await middleware(makeRequest("/app/careers"));
    expect(global.fetch).toHaveBeenCalledWith(
      "https://log-api.newrelic.com/log/v1",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    const attrs = body[0].logs[0].attributes;
    expect(attrs.logtype).toBe("edge_flag_assignment");
    expect(attrs.variation).toBe("challenger");
    expect(attrs.experiment).toBe("careers_experiment");
    expect(attrs.path).toBe("/app/careers");
  });

  it("calls next() without headers (no cookie set) when variation is null", async () => {
    mockGet.mockImplementation((key, def) => def); // returns null for "variation"
    await middleware(makeRequest("/app/careers"));
    expect(mockNext).toHaveBeenCalledWith(); // no Set-Cookie
  });
});

// ─── Statsig gate kill switch ─────────────────────────────────────────────────
describe("Statsig gate kill switch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNext.mockReturnValue(new Response());
    mockCheckGate.mockReturnValue(true); // gate is ON
  });

  it("initialises Statsig but does not call getExperiment", async () => {
    await middleware(makeRequest("/app/careers"));
    expect(mockInitializeAsync).toHaveBeenCalled();
    expect(mockGetExperiment).not.toHaveBeenCalled();
  });

  it("logs kill_switch_activated with trigger=statsig_gate to New Relic", async () => {
    await middleware(makeRequest("/app/careers"));
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    const attrs = body[0].logs[0].attributes;
    expect(attrs.logtype).toBe("kill_switch_activated");
    expect(attrs.trigger).toBe("statsig_gate");
    expect(attrs.feature_flag).toBe("careers_experiment");
  });

  it("calls next() without setting a variant cookie", async () => {
    await middleware(makeRequest("/app/careers"));
    const cookies = getSetCookies(mockNext.mock.calls[0]);
    expect(cookies.some((c) => c.includes("statsig_exp_careers"))).toBe(false);
  });
});

// ─── Statsig timeout / failure fallback ──────────────────────────────────────
describe("Statsig timeout fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNext.mockReturnValue(new Response());
    mockInitializeAsync.mockRejectedValue(new Error("statsig timeout"));
  });

  it("returns next() without throwing when Statsig init fails", async () => {
    await expect(middleware(makeRequest("/app/careers"))).resolves.not.toThrow();
    expect(mockNext).toHaveBeenCalledWith(); // no Set-Cookie
  });

  it("does not push to New Relic when Statsig init fails", async () => {
    await middleware(makeRequest("/app/careers"));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ─── Env-var kill switch (requires module reload with new env vars) ───────────
describe("env-var kill switch — KILL_SWITCH_CAREERS=true", () => {
  let ksMiddleware;

  beforeAll(async () => {
    process.env.KILL_SWITCH_CAREERS = "true";
    vi.resetModules();
    ksMiddleware = (await import("../../middleware.js")).default;
  });

  afterAll(() => {
    process.env.KILL_SWITCH_CAREERS = "false";
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockNext.mockReturnValue(new Response());
  });

  it("does not call Statsig when env kill switch is active", async () => {
    await ksMiddleware(makeRequest("/app/careers", "statsig_exp_careers=challenger"));
    expect(mockInitializeAsync).not.toHaveBeenCalled();
  });

  it("clears existing variant cookie (Max-Age=0) when kill switch is active", async () => {
    await ksMiddleware(makeRequest("/app/careers", "statsig_exp_careers=challenger"));
    const cookies = getSetCookies(mockNext.mock.calls[0]);
    expect(cookies.some((c) => c.includes("statsig_exp_careers=") && c.includes("Max-Age=0"))).toBe(true);
  });

  it("logs kill_switch_activated with trigger=env_var and correct feature_flag", async () => {
    await ksMiddleware(makeRequest("/app/careers", "statsig_exp_careers=control"));
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    const attrs = body[0].logs[0].attributes;
    expect(attrs.logtype).toBe("kill_switch_activated");
    expect(attrs.trigger).toBe("env_var");
    expect(attrs.feature_flag).toBe("careers_experiment");
  });

  it("calls next() without clearing headers when no cookie exists to clear", async () => {
    await ksMiddleware(makeRequest("/app/careers", ""));
    // Kill switch fires but no cookie to clear — should still log but not set headers
    expect(mockNext).toHaveBeenCalledWith(); // no Set-Cookie headers
    expect(mockInitializeAsync).not.toHaveBeenCalled();
  });
});

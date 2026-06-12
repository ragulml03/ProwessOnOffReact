import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useExperiment, trackExperimentGoal } from "../hooks/useExperiment";

function clearCookies() {
  document.cookie.split(";").forEach((c) => {
    const name = c.split("=")[0].trim();
    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
    }
  });
}

describe("useExperiment — cookie reading", () => {
  beforeEach(() => {
    clearCookies();
    vi.clearAllMocks();
  });

  it("returns 'control' when no cookie is set", () => {
    const { result } = renderHook(() => useExperiment("careers"));
    expect(result.current.variation).toBe("control");
  });

  it("returns cookie value when statsig_exp_careers=challenger is set", () => {
    document.cookie = "statsig_exp_careers=challenger";
    const { result } = renderHook(() => useExperiment("careers"));
    expect(result.current.variation).toBe("challenger");
  });

  it("returns cookie value when statsig_exp_careers=control is set", () => {
    document.cookie = "statsig_exp_careers=control";
    const { result } = renderHook(() => useExperiment("careers"));
    expect(result.current.variation).toBe("control");
  });

  it("returns cookie value for profile experiment", () => {
    document.cookie = "statsig_exp_profile=challenger";
    const { result } = renderHook(() => useExperiment("profile"));
    expect(result.current.variation).toBe("challenger");
  });

  it("falls back to control for unknown experiment key", () => {
    const { result } = renderHook(() => useExperiment("unknown_key"));
    expect(result.current.variation).toBe("control");
  });

  it("is not affected by a different experiment's cookie", () => {
    document.cookie = "statsig_exp_profile=challenger";
    const { result } = renderHook(() => useExperiment("careers"));
    // careers has no cookie, should fall back to control
    expect(result.current.variation).toBe("control");
  });
});

describe("useExperiment — isLoading is always false", () => {
  beforeEach(clearCookies);

  it("returns isLoading=false when no cookie (variation from edge, never async)", () => {
    const { result } = renderHook(() => useExperiment("careers"));
    expect(result.current.isLoading).toBe(false);
  });

  it("returns isLoading=false when cookie is set", () => {
    document.cookie = "statsig_exp_careers=challenger";
    const { result } = renderHook(() => useExperiment("careers"));
    expect(result.current.isLoading).toBe(false);
  });
});

describe("trackExperimentGoal", () => {
  it("calls logEvent on the client with goal name and experiment metadata", () => {
    const mockClient = { logEvent: vi.fn() };
    trackExperimentGoal(mockClient, "careers_experiment", "apply_click", { job: "Engineer" });
    expect(mockClient.logEvent).toHaveBeenCalledWith(
      "apply_click",
      null,
      { experiment: "careers_experiment", job: "Engineer" }
    );
  });

  it("calls logEvent without extra metadata when not provided", () => {
    const mockClient = { logEvent: vi.fn() };
    trackExperimentGoal(mockClient, "careers_experiment", "page_view");
    expect(mockClient.logEvent).toHaveBeenCalledWith(
      "page_view",
      null,
      { experiment: "careers_experiment" }
    );
  });

  it("does not throw when client is null", () => {
    expect(() =>
      trackExperimentGoal(null, "careers_experiment", "apply_click")
    ).not.toThrow();
  });

  it("does not throw when client is undefined", () => {
    expect(() =>
      trackExperimentGoal(undefined, "careers_experiment", "apply_click")
    ).not.toThrow();
  });

  it("does not throw when client has no logEvent method", () => {
    expect(() =>
      trackExperimentGoal({}, "careers_experiment", "apply_click")
    ).not.toThrow();
  });
});

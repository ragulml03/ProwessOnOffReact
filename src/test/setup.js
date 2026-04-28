import "@testing-library/jest-dom";

vi.spyOn(console, "log").mockImplementation(() => {});

window.AB_TEST_DATA = {
  platform_version: "react_modern",
  user_id: "test-user-123",
  migration_group: "react-migration-test-enabled",
};

window.navigator.sendBeacon = vi.fn();

vi.mock("mixpanel-browser", () => ({
  default: { init: vi.fn(), track: vi.fn() },
}));

vi.mock("@statsig/react-bindings", () => ({
  StatsigProvider:  ({ children }) => children,
  useStatsigClient: () => ({ client: { logEvent: vi.fn() }, isLoading: false }),
  useFeatureGate:   () => ({ value: false, isLoading: false }),
}));

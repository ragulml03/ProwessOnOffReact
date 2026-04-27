import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CareersPage from "../pages/CareersPage";

vi.mock("launchdarkly-react-client-sdk", () => ({
  useFlags: () => ({ reactMigrationTest: true }),
  useLDClient: () => ({ track: vi.fn() }),
}));

vi.mock("../hooks/useVwoExperiment", () => ({
  useVwoExperiment: vi.fn(),
  trackVwoGoal: vi.fn(),
}));

vi.mock("../analytics/pinpoint.js", () => ({
  trackVwoVariationAssigned: vi.fn(),
  trackVwoGoalConverted: vi.fn(),
  trackLdConversion: vi.fn(),
  trackApplyClick: vi.fn(),
}));

vi.mock("../components/ReactBadge", () => ({
  default: () => <div data-testid="react-badge" />,
}));

import { useVwoExperiment } from "../hooks/useVwoExperiment";

const sampleSiteData = {
  careers: {
    pageTitle: "Join Our Team",
    pageSubtitle: "Build the future with us",
    jobs: [
      { title: "Senior Engineer", department: "Engineering", type: "Full Time", location: "Remote", description: "Build great things." },
      { title: "Product Designer", department: "Design", type: "Full Time", location: "Hybrid", description: "Design great things." },
    ],
  },
};

describe("CareersPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows skeleton while VWO is loading", () => {
    useVwoExperiment.mockReturnValue({ variationId: null, isLoading: true });
    const { container } = render(<CareersPage siteData={sampleSiteData} />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders Control hero when variation is 1", () => {
    useVwoExperiment.mockReturnValue({ variationId: 1, isLoading: false });
    render(<CareersPage siteData={sampleSiteData} />);
    expect(screen.getByText("We're Hiring")).toBeInTheDocument();
  });

  it("renders Challenger hero when variation is 2", () => {
    useVwoExperiment.mockReturnValue({ variationId: 2, isLoading: false });
    render(<CareersPage siteData={sampleSiteData} />);
    expect(screen.getByText("Shape What's Next")).toBeInTheDocument();
  });

  it("renders all job listings", () => {
    useVwoExperiment.mockReturnValue({ variationId: 1, isLoading: false });
    render(<CareersPage siteData={sampleSiteData} />);
    expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
    expect(screen.getByText("Product Designer")).toBeInTheDocument();
  });

  it("shows correct open roles count", () => {
    useVwoExperiment.mockReturnValue({ variationId: 1, isLoading: false });
    render(<CareersPage siteData={sampleSiteData} />);
    expect(screen.getByText("2 Open Roles")).toBeInTheDocument();
  });

  it("opens success modal when Apply Now is clicked", () => {
    useVwoExperiment.mockReturnValue({ variationId: 1, isLoading: false });
    render(<CareersPage siteData={sampleSiteData} />);
    fireEvent.click(screen.getAllByText("Apply Now")[0]);
    expect(screen.getByText("Application Received!")).toBeInTheDocument();
  });

  it("Challenger apply button says Start Your Journey", () => {
    useVwoExperiment.mockReturnValue({ variationId: 2, isLoading: false });
    render(<CareersPage siteData={sampleSiteData} />);
    expect(screen.getAllByText("Start Your Journey →").length).toBeGreaterThan(0);
  });

  it("closes success modal when Got it button is clicked", () => {
    useVwoExperiment.mockReturnValue({ variationId: 1, isLoading: false });
    render(<CareersPage siteData={sampleSiteData} />);
    fireEvent.click(screen.getAllByText("Apply Now")[0]);
    fireEvent.click(screen.getByText("Got it, Thanks!"));
    expect(screen.queryByText("Application Received!")).not.toBeInTheDocument();
  });

  it("handles empty jobs list gracefully", () => {
    useVwoExperiment.mockReturnValue({ variationId: 1, isLoading: false });
    render(<CareersPage siteData={{ careers: { jobs: [] } }} />);
    expect(screen.getByText("0 Open Roles")).toBeInTheDocument();
  });
});

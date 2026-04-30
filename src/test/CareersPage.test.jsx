import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CareersPage from "../pages/CareersPage";

vi.mock("../hooks/useExperiment", () => ({
  useExperiment: vi.fn(),
  trackExperimentGoal: vi.fn(),
}));

vi.mock("../analytics/pinpoint.js", () => ({
  trackStatsigVariationAssigned: vi.fn(),
  trackStatsigGoalConverted: vi.fn(),
  trackApplyClick: vi.fn(),
}));

vi.mock("../components/ReactBadge", () => ({
  default: () => <div data-testid="react-badge" />,
}));

import { useExperiment } from "../hooks/useExperiment";

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

  it("shows skeleton while experiment is loading", () => {
    useExperiment.mockReturnValue({ variation: null, isLoading: true });
    const { container } = render(<CareersPage siteData={sampleSiteData} />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders Control hero when variation is control", () => {
    useExperiment.mockReturnValue({ variation: "control", isLoading: false });
    render(<CareersPage siteData={sampleSiteData} />);
    expect(screen.getByText("We're Hiring")).toBeInTheDocument();
  });

  it("renders Challenger hero when variation is challenger", () => {
    useExperiment.mockReturnValue({ variation: "challenger", isLoading: false });
    render(<CareersPage siteData={sampleSiteData} />);
    expect(screen.getByText("Shape What's Next")).toBeInTheDocument();
  });

  it("renders all job listings", () => {
    useExperiment.mockReturnValue({ variation: "control", isLoading: false });
    render(<CareersPage siteData={sampleSiteData} />);
    expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
    expect(screen.getByText("Product Designer")).toBeInTheDocument();
  });

  it("shows correct open roles count", () => {
    useExperiment.mockReturnValue({ variation: "control", isLoading: false });
    render(<CareersPage siteData={sampleSiteData} />);
    expect(screen.getByText("2 Open Roles")).toBeInTheDocument();
  });

  it("opens success modal when Apply Now is clicked", () => {
    useExperiment.mockReturnValue({ variation: "control", isLoading: false });
    render(<CareersPage siteData={sampleSiteData} />);
    fireEvent.click(screen.getAllByText("Apply Now")[0]);
    expect(screen.getByText("Application Received!")).toBeInTheDocument();
  });

  it("Challenger apply button says Start Your Journey", () => {
    useExperiment.mockReturnValue({ variation: "challenger", isLoading: false });
    render(<CareersPage siteData={sampleSiteData} />);
    expect(screen.getAllByText("Start Your Journey →").length).toBeGreaterThan(0);
  });

  it("closes success modal when Got it button is clicked", () => {
    useExperiment.mockReturnValue({ variation: "control", isLoading: false });
    render(<CareersPage siteData={sampleSiteData} />);
    fireEvent.click(screen.getAllByText("Apply Now")[0]);
    fireEvent.click(screen.getByText("Got it, Thanks!"));
    expect(screen.queryByText("Application Received!")).not.toBeInTheDocument();
  });

  it("handles empty jobs list gracefully", () => {
    useExperiment.mockReturnValue({ variation: "control", isLoading: false });
    render(<CareersPage siteData={{ careers: { jobs: [] } }} />);
    expect(screen.getByText("0 Open Roles")).toBeInTheDocument();
  });
});

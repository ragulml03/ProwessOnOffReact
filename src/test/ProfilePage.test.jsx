import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ProfilePage from "../pages/ProfilePage";

vi.mock("../hooks/useExperiment", () => ({
  useExperiment: vi.fn(),
  trackExperimentGoal: vi.fn(),
}));

vi.mock("../analytics/pinpoint.js", () => ({
  trackVwoVariationAssigned: vi.fn(),
  trackVwoGoalConverted: vi.fn(),
  trackProfileAction: vi.fn(),
}));

vi.mock("../components/ReactBadge", () => ({
  default: () => <div data-testid="react-badge" />,
}));

import { useExperiment } from "../hooks/useExperiment";

const sampleSiteData = {
  profile: {
    user: {
      name: "Jane Doe",
      email: "jane@offon.com",
      plan: "Enterprise",
      role: "Admin",
      joinDate: "Jan 2023",
      avatarInitials: "JD",
    },
    stats: [
      { label: "Projects", value: "12" },
      { label: "Flags Active", value: "34" },
      { label: "Team Members", value: "5" },
      { label: "Deployments", value: "89" },
    ],
    recentFlags: [
      { name: "react-migration-test", status: "On", environment: "Production", updatedAt: "2d ago" },
      { name: "dark-mode", status: "Off", environment: "Staging", updatedAt: "5d ago" },
    ],
  },
};

function renderProfile(siteData = sampleSiteData) {
  return render(
    <MemoryRouter>
      <ProfilePage siteData={siteData} />
    </MemoryRouter>
  );
}

describe("ProfilePage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders user name", () => {
    useExperiment.mockReturnValue({ variation: "control", isLoading: false });
    renderProfile();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("renders Control stat cards without trend indicators", () => {
    useExperiment.mockReturnValue({ variation: "control", isLoading: false });
    renderProfile();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.queryByText(/vs last month/)).not.toBeInTheDocument();
  });

  it("renders Challenger stat cards with trend indicators", () => {
    useExperiment.mockReturnValue({ variation: "challenger", isLoading: false });
    renderProfile();
    expect(screen.getAllByText("vs last month").length).toBeGreaterThan(0);
  });

  it("renders recent flags by name", () => {
    useExperiment.mockReturnValue({ variation: "control", isLoading: false });
    renderProfile();
    expect(screen.getByText("react-migration-test")).toBeInTheDocument();
    expect(screen.getByText("dark-mode")).toBeInTheDocument();
  });

  it("opens Control modal when Edit Profile is clicked", () => {
    useExperiment.mockReturnValue({ variation: "control", isLoading: false });
    renderProfile();
    fireEvent.click(screen.getByText("Edit Profile"));
    expect(screen.getByText("Profile is Up to Date")).toBeInTheDocument();
  });

  it("opens Challenger modal when Edit Profile is clicked", () => {
    useExperiment.mockReturnValue({ variation: "challenger", isLoading: false });
    renderProfile();
    fireEvent.click(screen.getByText("Edit Profile"));
    expect(screen.getByText("You're All Set!")).toBeInTheDocument();
  });

  it("closes modal when Got it button is clicked", () => {
    useExperiment.mockReturnValue({ variation: "control", isLoading: false });
    renderProfile();
    fireEvent.click(screen.getByText("Edit Profile"));
    fireEvent.click(screen.getByText("Got it!"));
    expect(screen.queryByText("Profile is Up to Date")).not.toBeInTheDocument();
  });

  it("handles missing siteData gracefully", () => {
    useExperiment.mockReturnValue({ variation: "control", isLoading: false });
    render(
      <MemoryRouter>
        <ProfilePage siteData={null} />
      </MemoryRouter>
    );
    expect(screen.getByText("OffOn User")).toBeInTheDocument();
  });
});

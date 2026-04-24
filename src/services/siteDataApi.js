const fallbackSiteData = {
  careers: {
    pageTitle: "Build the future of feature delivery.",
    pageSubtitle:
      "We are a remote-first team that ships fast, thinks deeply, and values craft. Come build tools that thousands of engineers rely on every day.",
    jobs: [
      {
        id: 1,
        title: "Senior Backend Engineer",
        department: "Engineering",
        location: "Remote",
        type: "Full-time",
        description:
          "Build and scale the core flag evaluation engine serving billions of requests per day. You will own reliability, performance, and the SDK ecosystem.",
      },
      {
        id: 2,
        title: "Frontend Engineer",
        department: "Engineering",
        location: "Remote",
        type: "Full-time",
        description:
          "Craft the dashboard UI that thousands of engineers use daily to manage their releases. React, TypeScript, and a strong design sensibility required.",
      },
      {
        id: 3,
        title: "Product Designer",
        department: "Design",
        location: "Remote",
        type: "Full-time",
        description:
          "Shape the user experience for developer tooling that balances power with simplicity. Own the full design process from discovery to shipped pixels.",
      },
      {
        id: 4,
        title: "Developer Advocate",
        department: "Marketing",
        location: "Remote",
        type: "Full-time",
        description:
          "Build relationships with developer communities and help teams get the most from OffOn. Write, speak, and ship sample apps that make the docs come alive.",
      },
      {
        id: 5,
        title: "Site Reliability Engineer",
        department: "Engineering",
        location: "Remote",
        type: "Full-time",
        description:
          "Own the reliability, observability, and performance of our global flag delivery infrastructure. Oncall with excellent tooling and a blameless culture.",
      },
      {
        id: 6,
        title: "Sales Engineer",
        department: "Sales",
        location: "Remote / US",
        type: "Full-time",
        description:
          "Partner with enterprise prospects to demonstrate value and guide technical evaluation. Deep product knowledge and communication skills are your superpowers.",
      },
    ],
  },
  profile: {
    user: {
      name: "Demo User",
      email: "demo@offon.dev",
      role: "Admin",
      plan: "Enterprise",
      joinDate: "January 15, 2024",
      avatarInitials: "DU",
    },
    stats: [
      { label: "Active Projects", value: "12" },
      { label: "Feature Flags", value: "148" },
      { label: "Team Members", value: "8" },
      { label: "Experiments Run", value: "34" },
    ],
    recentFlags: [
      { name: "dark-mode-beta", status: "On", environment: "Production", updatedAt: "2 hours ago" },
      { name: "new-checkout-flow", status: "Off", environment: "Staging", updatedAt: "1 day ago" },
      { name: "ai-search-preview", status: "On", environment: "Canary", updatedAt: "3 days ago" },
      { name: "legacy-api-sunset", status: "Off", environment: "Production", updatedAt: "1 week ago" },
    ],
  },
};

export async function fetchSiteData() {
  try {
    const response = await fetch("/api/site-data");
    if (!response.ok) {
      return fallbackSiteData;
    }
    const data = await response.json();
    return data ?? fallbackSiteData;
  } catch {
    return fallbackSiteData;
  }
}

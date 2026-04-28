import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { StatsigProvider } from "@statsig/react-bindings";
import AppShell from "./layouts/AppShell";
import CareersPage from "./pages/CareersPage";
import NotFoundPage from "./pages/NotFoundPage";
import ProfilePage from "./pages/ProfilePage";
import { fetchSiteData } from "./services/siteDataApi";
import { trackPageView } from "./analytics/pinpoint.js";

const STATSIG_CLIENT_KEY = import.meta.env.VITE_STATSIG_CLIENT_KEY ?? "";

// Returns real user ID if available, otherwise a stable per-browser UUID.
// Avoids logging every visitor as "anonymous" which breaks Statsig health checks.
function getStableUserId() {
  const realId = window.AB_TEST_DATA?.user_id;
  if (realId && realId !== "anonymous") return realId;
  const stored = localStorage.getItem("prowess_anon_id");
  if (stored) return stored;
  const newId = crypto.randomUUID();
  localStorage.setItem("prowess_anon_id", newId);
  return newId;
}

function App() {
  const [siteData, setSiteData] = useState(null);
  const location = useLocation();

  useEffect(() => {
    fetchSiteData().then((data) => setSiteData(data));
  }, []);

  // Write stable user ID cookie so Edge Middleware uses the same ID as Statsig client
  useEffect(() => {
    const userId = getStableUserId();
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `prowess_user_id=${encodeURIComponent(userId)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  }, []);

  // Track every route change as a page_view in Pinpoint
  useEffect(() => {
    const platform = window.AB_TEST_DATA?.platform_version ?? "react_modern";
    const migrationGroup = window.AB_TEST_DATA?.migration_group ?? "";
    trackPageView(location.pathname, platform, migrationGroup);
  }, [location.pathname]);

  const statsigUser = {
    userID: getStableUserId(),
    custom: {
      platform_version: window.AB_TEST_DATA?.platform_version ?? "react_modern",
      migration_group:  window.AB_TEST_DATA?.migration_group  ?? "",
    },
  };

  return (
    <StatsigProvider sdkKey={STATSIG_CLIENT_KEY} user={statsigUser}>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/app/careers" replace />} />
          <Route path="/app/careers" element={<CareersPage siteData={siteData} />} />
          <Route path="/app/profile" element={<ProfilePage siteData={siteData} />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppShell>
    </StatsigProvider>
  );
}

export default App;

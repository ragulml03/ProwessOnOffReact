import { useEffect, useState } from "react";
import { withLDProvider } from "launchdarkly-react-client-sdk";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { StatsigProvider } from "@statsig/react-bindings";
import AppShell from "./layouts/AppShell";
import { getLaunchDarklyConfig } from "./launchDarkly";
import CareersPage from "./pages/CareersPage";
import NotFoundPage from "./pages/NotFoundPage";
import ProfilePage from "./pages/ProfilePage";
import { fetchSiteData } from "./services/siteDataApi";
import { trackPageView } from "./analytics/pinpoint.js";

const STATSIG_CLIENT_KEY = import.meta.env.VITE_STATSIG_CLIENT_KEY ?? "";

function App() {
  const [siteData, setSiteData] = useState(null);
  const location = useLocation();

  useEffect(() => {
    fetchSiteData().then((data) => setSiteData(data));
  }, []);

  // Write real user ID cookie so Edge Middleware can use it on next request
  useEffect(() => {
    const userId = window.AB_TEST_DATA?.user_id;
    if (!userId) return;
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
    userID: window.AB_TEST_DATA?.user_id ?? "anonymous",
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

const { clientSideId, context } = getLaunchDarklyConfig();

export default withLDProvider({
  clientSideID: clientSideId,
  context,
  options: { streaming: true },
})(App);

import { useEffect, useState } from "react";
import { withLDProvider } from "launchdarkly-react-client-sdk";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppShell from "./layouts/AppShell";
import { getLaunchDarklyConfig } from "./launchDarkly";
import CareersPage from "./pages/CareersPage";
import NotFoundPage from "./pages/NotFoundPage";
import ProfilePage from "./pages/ProfilePage";
import { fetchSiteData } from "./services/siteDataApi";
import { trackPageView } from "./analytics/pinpoint.js";

function App() {
  const [siteData, setSiteData] = useState(null);
  const location = useLocation();

  useEffect(() => {
    fetchSiteData().then((data) => setSiteData(data));
  }, []);

  // Write the real user ID into a cookie so Edge Middleware can read it
  // on the NEXT request. Middleware runs before React, so first-visit gets
  // an anonymous ID; from second visit onward the real identity is used.
  useEffect(() => {
    const userId = window.AB_TEST_DATA?.user_id;
    if (!userId) return;
    const maxAge = 60 * 60 * 24 * 365; // 1 year — identity cookie
    document.cookie = `prowess_user_id=${encodeURIComponent(userId)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  }, []);

  // Track every route change as a page_view in Pinpoint
  useEffect(() => {
    const platform = window.AB_TEST_DATA?.platform_version ?? "react_modern";
    const migrationGroup = window.AB_TEST_DATA?.migration_group ?? "";
    trackPageView(location.pathname, platform, migrationGroup);
  }, [location.pathname]);

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/app/careers" replace />} />
        <Route path="/app/careers" element={<CareersPage siteData={siteData} />} />
        <Route path="/app/profile" element={<ProfilePage siteData={siteData} />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}

const { clientSideId, context } = getLaunchDarklyConfig();

export default withLDProvider({
  clientSideID: clientSideId,
  context,
  options: {
    streaming: true,
  },
})(App);

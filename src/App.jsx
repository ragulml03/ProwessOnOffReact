import { useEffect, useState } from "react";
import { withLDProvider } from "launchdarkly-react-client-sdk";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./layouts/AppShell";
import { getLaunchDarklyConfig } from "./launchDarkly";
import CareersPage from "./pages/CareersPage";
import NotFoundPage from "./pages/NotFoundPage";
import ProfilePage from "./pages/ProfilePage";
import { fetchSiteData } from "./services/siteDataApi";

function App() {
  const [siteData, setSiteData] = useState(null);

  useEffect(() => {
    fetchSiteData().then((data) => setSiteData(data));
  }, []);

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

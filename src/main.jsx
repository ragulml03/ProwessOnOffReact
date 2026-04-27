import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import App from "./App.jsx";
import "./index.css";
import { trackWebVital } from "./analytics/pinpoint.js";

// ─── Core Web Vitals — report to GA4 + our own API ───────────────────────────
// Metrics: LCP (load speed), CLS (layout stability), INP (responsiveness),
//          FCP (first paint), TTFB (server response time).
// GA4 measurement ID is set in index.html as window.GA_MEASUREMENT_ID.
function reportVital({ name, value, id, rating }) {
  // 1. Send to Google Analytics 4 as a custom event
  if (typeof window.gtag === "function") {
    window.gtag("event", name, {
      value: Math.round(name === "CLS" ? value * 1000 : value),
      metric_id: id,
      metric_rating: rating,             // "good" | "needs-improvement" | "poor"
      metric_delta: value,
      platform: "react",
      non_interaction: true,
    });
  }

  // 2. Also POST to .NET backend so metrics appear in server logs / Datadog
  const platform = window.AB_TEST_DATA?.platform_version ?? "react_modern";
  navigator.sendBeacon?.("/api/track-vitals", JSON.stringify({ name, value: Math.round(value), rating, platform }));

  // 3. AWS Pinpoint — core_web_vital event
  trackWebVital(name, value, rating, platform);
}

onCLS(reportVital);
onFCP(reportVital);
onINP(reportVital);
onLCP(reportVital);
onTTFB(reportVital);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

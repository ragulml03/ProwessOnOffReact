import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import App from "./App.jsx";
import "./index.css";
import { trackWebVital, trackJsError } from "./analytics/pinpoint.js";

function reportVital({ name, value, rating }) {
  const platform = window.AB_TEST_DATA?.platform_version ?? "react_modern";
  navigator.sendBeacon?.("/api/track-vitals", JSON.stringify({ name, value: Math.round(value), rating, platform }));
  trackWebVital(name, value, rating, platform);
}

onCLS(reportVital);
onFCP(reportVital);
onINP(reportVital);
onLCP(reportVital);
onTTFB(reportVital);

// ─── Crash analytics ──────────────────────────────────────────────────────────
window.addEventListener("error", (event) => {
  trackJsError(event.message, {
    filename: event.filename,
    line: event.lineno,
    col: event.colno,
    platform: window.AB_TEST_DATA?.platform_version ?? "react_modern",
  });
});

window.addEventListener("unhandledrejection", (event) => {
  trackJsError(String(event.reason), {
    type: "unhandled_promise",
    platform: window.AB_TEST_DATA?.platform_version ?? "react_modern",
  });
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

import { BrowserAgent } from "@newrelic/browser-agent/loaders/browser-agent";

// Browser ingest keys are public by design — safe to ship client-side.
// Store in env vars so they can differ per environment (dev / staging / prod).
const LICENSE_KEY    = import.meta.env.VITE_NEW_RELIC_LICENSE_KEY    ?? "";
const APPLICATION_ID = Number(import.meta.env.VITE_NEW_RELIC_APPLICATION_ID ?? 0);
const ACCOUNT_ID     = Number(import.meta.env.VITE_NEW_RELIC_ACCOUNT_ID     ?? 0);

/**
 * Call once before React mounts (in main.jsx).
 * No-ops gracefully when env vars are absent (local dev without NR configured).
 */
export function initNewRelic() {
  if (!LICENSE_KEY || !APPLICATION_ID) return;

  new BrowserAgent({
    info: {
      applicationID: APPLICATION_ID,
      beacon:        "bam.nr-data.net",
      errorBeacon:   "bam.nr-data.net",
      licenseKey:    LICENSE_KEY,
      sa: 1,
    },
    init: {
      ajax:                 { deny_list: ["bam.nr-data.net"] },
      browser_consent_mode: { enabled: false },
      distributed_tracing:  { enabled: true },
      performance:          { capture_detail: false, capture_marks: false, capture_measures: true },
      privacy:              { cookies_enabled: true },
    },
    loader_config: {
      accountID:     ACCOUNT_ID,
      agentID:       APPLICATION_ID,
      applicationID: APPLICATION_ID,
      licenseKey:    LICENSE_KEY,
      trustKey:      ACCOUNT_ID,
    },
  });
}

/**
 * Fire a custom PageAction event visible in New Relic dashboards.
 * Automatically attaches platform_version and migration_group from
 * window.AB_TEST_DATA so every event is sliceable by experiment cohort.
 */
export function pageAction(name, attributes = {}) {
  try {
    window.newrelic?.addPageAction(name, {
      platform:        window.AB_TEST_DATA?.platform_version ?? "react_modern",
      migration_group: window.AB_TEST_DATA?.migration_group  ?? "",
      ...attributes,
    });
  } catch {
    // Never let analytics break the user flow.
  }
}

/**
 * Send a JS error to New Relic Errors Inbox.
 * Unlike pageAction, this surfaces in the dedicated error-tracking UI.
 */
export function noticeError(message, context = {}) {
  try {
    window.newrelic?.noticeError(
      new Error(String(message).slice(0, 300)),
      context
    );
  } catch {
    // silent
  }
}

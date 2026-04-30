import mixpanel from "mixpanel-browser";

// EU data residency — matches eu.mixpanel.com account
mixpanel.init(import.meta.env.VITE_MIXPANEL_TOKEN ?? "", {
  api_host: "https://api-eu.mixpanel.com",
  persistence: "localStorage",
  ignore_dnt: false,
});

const enabled = Boolean(import.meta.env.VITE_MIXPANEL_TOKEN);

function track(name, properties = {}) {
  if (!enabled) return;
  try {
    const platform = window.AB_TEST_DATA?.platform_version ?? "react_modern";
    const migrationGroup = window.AB_TEST_DATA?.migration_group ?? "";
    mixpanel.track(name, { platform, migration_group: migrationGroup, ...properties });
  } catch {
    // Never let analytics throw break the user flow.
  }
}

// ─── 1. Page view ─────────────────────────────────────────────────────────────
export function trackPageView(page, platform, migrationGroup) {
  track("page_view", { page, platform, migration_group: migrationGroup ?? "" });
}

// ─── 2. Core Web Vital ────────────────────────────────────────────────────────
export function trackWebVital(name, value, rating, platform) {
  track("core_web_vital", { metric_name: name, value: Math.round(value), rating, platform });
}

// ─── 3. Statsig variation assigned ───────────────────────────────────────────
export function trackStatsigVariationAssigned(experimentKey, variation, variationLabel, page) {
  track("statsig_variation_assigned", {
    experiment_key: experimentKey,
    variation,
    variation_label: variationLabel,
    page,
  });
}

// ─── 4. Statsig goal converted ────────────────────────────────────────────────
export function trackStatsigGoalConverted(experimentKey, goalName, variationLabel, context = {}) {
  track("statsig_goal_converted", {
    experiment_key: experimentKey,
    goal_name: goalName,
    variation_label: variationLabel,
    ...context,
  });
}

// ─── 5. Apply click (Careers page) ───────────────────────────────────────────
export function trackApplyClick(jobTitle, variationLabel, platform) {
  track("apply_click", { job_title: jobTitle ?? "", variation_label: variationLabel, platform });
}

// ─── 6. Profile action ────────────────────────────────────────────────────────
export function trackProfileAction(actionType, variationLabel, platform) {
  track("profile_action", { action: actionType, variation_label: variationLabel, platform });
}

// ─── 7. JS error (crash analytics) ───────────────────────────────────────────
export function trackJsError(message, context = {}) {
  track("js_error", { message: String(message).slice(0, 300), ...context });
}

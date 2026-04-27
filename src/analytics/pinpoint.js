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

// ─── 3. VWO variation assigned ────────────────────────────────────────────────
export function trackVwoVariationAssigned(campaignId, variationId, variationLabel, page) {
  track("vwo_variation_assigned", {
    campaign_id: campaignId,
    variation_id: variationId,
    variation_label: variationLabel,
    page,
  });
}

// ─── 4. VWO goal converted ────────────────────────────────────────────────────
export function trackVwoGoalConverted(campaignId, goalId, variationLabel, context = {}) {
  track("vwo_goal_converted", {
    campaign_id: campaignId,
    goal_id: goalId,
    variation_label: variationLabel,
    ...context,
  });
}

// ─── 5. LaunchDarkly flag evaluated ───────────────────────────────────────────
export function trackLdFlagEvaluated(flagKey, value, userId) {
  track("ld_flag_evaluated", {
    flag_key: flagKey,
    flag_value: String(value),
    user_id: userId ?? "",
  });
}

// ─── 6. LaunchDarkly conversion ───────────────────────────────────────────────
export function trackLdConversion(eventName, attributes = {}) {
  track("ld_conversion", { event_name: eventName, ...attributes });
}

// ─── 7. Apply click (Careers page) ───────────────────────────────────────────
export function trackApplyClick(jobTitle, variationLabel, platform) {
  track("apply_click", { job_title: jobTitle ?? "", variation_label: variationLabel, platform });
}

// ─── 8. Profile action ────────────────────────────────────────────────────────
export function trackProfileAction(actionType, variationLabel, platform) {
  track("profile_action", { action: actionType, variation_label: variationLabel, platform });
}

// ─── 9. JS error (crash analytics) ───────────────────────────────────────────
export function trackJsError(message, context = {}) {
  track("js_error", { message: String(message).slice(0, 300), ...context });
}

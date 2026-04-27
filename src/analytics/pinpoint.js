import { Amplify } from "aws-amplify";
import { record } from "aws-amplify/analytics";

// Initialise Amplify once. No-ops gracefully if env vars are not set
// (local dev without AWS credentials configured).
Amplify.configure({
  Auth: {
    Cognito: {
      identityPoolId: import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID ?? "",
      allowGuestAccess: true,
    },
  },
  Analytics: {
    Pinpoint: {
      appId: import.meta.env.VITE_PINPOINT_APP_ID ?? "",
      region: import.meta.env.VITE_AWS_REGION ?? "eu-north-1",
    },
  },
});

const enabled = Boolean(import.meta.env.VITE_PINPOINT_APP_ID);

function track(name, attributes = {}, metrics = {}) {
  if (!enabled) return;
  try {
    record({ name, attributes, metrics });
  } catch {
    // Never let analytics throw break the user flow.
  }
}

// ─── 1. Page view ─────────────────────────────────────────────────────────────
export function trackPageView(page, platform, migrationGroup) {
  track("page_view", {
    page,
    platform: platform ?? "react_modern",
    migration_group: migrationGroup ?? "",
  });
}

// ─── 2. Core Web Vital ────────────────────────────────────────────────────────
export function trackWebVital(name, value, rating, platform) {
  track(
    "core_web_vital",
    { metric_name: name, rating, platform: platform ?? "react_modern" },
    { value: Math.round(value) }
  );
}

// ─── 3. VWO variation assigned (fires once per page when variation resolves) ──
export function trackVwoVariationAssigned(campaignId, variationId, variationLabel, page) {
  track("vwo_variation_assigned", {
    campaign_id: String(campaignId),
    variation_id: String(variationId),
    variation_label: variationLabel,
    page,
  });
}

// ─── 4. VWO goal converted ────────────────────────────────────────────────────
export function trackVwoGoalConverted(campaignId, goalId, variationLabel, context = {}) {
  track("vwo_goal_converted", {
    campaign_id: String(campaignId),
    goal_id: String(goalId),
    variation_label: variationLabel,
    ...context,
  });
}

// ─── 5. LaunchDarkly flag evaluated ──────────────────────────────────────────
export function trackLdFlagEvaluated(flagKey, value, userId) {
  track("ld_flag_evaluated", {
    flag_key: flagKey,
    flag_value: String(value),
    user_id: userId ?? "",
  });
}

// ─── 6. LaunchDarkly conversion (mirrors ldClient.track) ─────────────────────
export function trackLdConversion(eventName, attributes = {}) {
  track("ld_conversion", { event_name: eventName, ...attributes });
}

// ─── 7. Apply click (Careers page) ───────────────────────────────────────────
export function trackApplyClick(jobTitle, variationLabel, platform) {
  track("apply_click", {
    job_title: jobTitle ?? "",
    variation_label: variationLabel,
    platform: platform ?? "react_modern",
  });
}

// ─── 8. Profile action ────────────────────────────────────────────────────────
export function trackProfileAction(actionType, variationLabel, platform) {
  track("profile_action", {
    action: actionType,
    variation_label: variationLabel,
    platform: platform ?? "react_modern",
  });
}

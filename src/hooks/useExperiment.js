import { useEffect } from "react";
import { useStatsigClient } from "@statsig/react-bindings";

/**
 * useExperiment — server-side-only experiment hook.
 *
 * Variation is assigned exclusively by Vercel Edge Middleware (Statsig server call)
 * and delivered via cookie before the HTML is sent. React reads it synchronously —
 * no loading state, no async resolution, no skeleton, no client-side bucketing.
 *
 * If the cookie is absent (middleware skipped / local dev), defaults to "control"
 * immediately — still no loading state.
 */

const COOKIE_MAP = {
  careers: "statsig_exp_careers",
  profile: "statsig_exp_profile",
};

const EXPERIMENT_MAP = {
  careers: "careers_experiment",
  profile: "profile_experiment",
};

function readCookie(name) {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${encodeURIComponent(name)}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function useExperiment(experimentKey) {
  const cookieName     = COOKIE_MAP[experimentKey];
  const experimentName = EXPERIMENT_MAP[experimentKey];

  // Read variation set by Edge Middleware — synchronous, available before first render.
  const variation = (cookieName ? readCookie(cookieName) : null) ?? "control";

  // Keep useStatsigClient call unconditional (Rules of Hooks).
  let statsigClient = null;
  try {
    const ctx = useStatsigClient();
    statsigClient = ctx?.client ?? null;
  } catch {
    // Statsig provider not mounted (e.g. during tests)
  }

  // Log exposure for analytics only — does not affect which variation is shown.
  useEffect(() => {
    if (!statsigClient || !experimentName) return;
    statsigClient.logEvent("experiment_exposure", null, {
      experiment: experimentName,
      variation,
    });
  }, [experimentName, variation, statsigClient]);

  // isLoading is always false — variation is known synchronously from the cookie.
  return { variation, isLoading: false };
}

export function trackExperimentGoal(client, experimentName, goalName, metadata = {}) {
  try {
    client?.logEvent?.(goalName, null, { experiment: experimentName, ...metadata });
  } catch {
    // Never let analytics break user flow
  }
}

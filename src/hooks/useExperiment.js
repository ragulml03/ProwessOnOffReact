import { useState, useEffect, useRef } from "react";
import { useStatsigClient } from "@statsig/react-bindings";

/**
 * useExperiment — server-first experiment hook for React.
 *
 * Priority:
 *  1. Cookie set by Vercel Edge Middleware (instant, no flash).
 *  2. Statsig client SDK fallback if no cookie (e.g. localhost dev).
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
  const cookieName      = COOKIE_MAP[experimentKey];
  const experimentName  = EXPERIMENT_MAP[experimentKey];
  const serverVariation = cookieName ? readCookie(cookieName) : null;

  // Call hook before useState so initial isLoading can account for missing client
  let statsigClient = null;
  try {
    const ctx = useStatsigClient();
    statsigClient = ctx?.client ?? null;
  } catch {
    // Statsig provider not mounted (e.g. during tests)
  }

  const [variation, setVariation] = useState(serverVariation ?? "control");
  // Only show loading if we have no cookie AND have a Statsig client to resolve from
  const [isLoading, setIsLoading] = useState(serverVariation == null && statsigClient != null);
  const resolvedRef = useRef(serverVariation != null);

  useEffect(() => {
    if (!statsigClient || !experimentName) return;

    // Path A: server cookie present — log exposure via logEvent (v3 has no logExperimentExposure)
    if (serverVariation != null) {
      statsigClient.logEvent("experiment_exposure", null, {
        experiment: experimentName,
        variation: serverVariation,
      });
      return;
    }

    // Path B: no cookie — evaluate via client SDK (local dev without middleware)
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    statsigClient.initializeAsync?.().then(() => {
      try {
        const exp = statsigClient.getExperiment(experimentName);
        setVariation(exp.get("variation", "control"));
      } catch {
        setVariation("control");
      }
      setIsLoading(false);
    }).catch(() => {
      setVariation("control");
      setIsLoading(false);
    });
  }, [experimentName, serverVariation, statsigClient]);

  return { variation, isLoading };
}

export function trackExperimentGoal(client, experimentName, goalName, metadata = {}) {
  try {
    client?.logEvent?.(goalName, null, { experiment: experimentName, ...metadata });
  } catch {
    // Never let analytics break user flow
  }
}

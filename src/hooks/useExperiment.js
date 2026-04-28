import { useState, useEffect, useRef } from "react";
import { useStatsigClient } from "statsig-react";

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
  const cookieName       = COOKIE_MAP[experimentKey];
  const experimentName   = EXPERIMENT_MAP[experimentKey];
  const serverVariation  = cookieName ? readCookie(cookieName) : null;

  const [variation, setVariation] = useState(serverVariation ?? "control");
  const [isLoading, setIsLoading] = useState(serverVariation == null);
  const resolvedRef = useRef(serverVariation != null);

  let statsigClient = null;
  try {
    const ctx = useStatsigClient();
    statsigClient = ctx?.client ?? null;
  } catch {
    // Statsig provider not mounted (e.g. during tests)
  }

  useEffect(() => {
    // Path A: server cookie present — log exposure and done
    if (serverVariation != null) {
      statsigClient?.logExperimentExposure?.(experimentName);
      return;
    }

    // Path B: no cookie — fallback to Statsig client SDK
    if (!statsigClient || !experimentName) {
      setVariation("control");
      setIsLoading(false);
      return;
    }

    const resolve = () => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      try {
        const exp = statsigClient.getExperiment(experimentName);
        setVariation(exp.get("variation", "control"));
      } catch {
        setVariation("control");
      }
      setIsLoading(false);
    };

    if (statsigClient.initializeCalled?.()) {
      resolve();
    } else {
      statsigClient.initializeAsync?.().then(resolve).catch(() => {
        setVariation("control");
        setIsLoading(false);
      });
    }
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

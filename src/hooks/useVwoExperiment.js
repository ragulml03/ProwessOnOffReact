import { useState, useEffect, useRef } from "react";

/**
 * useVwoExperiment — server-first VWO A/B test hook for React.
 *
 * Priority order
 * ──────────────
 * 1. Read variation cookie set by Vercel Edge Middleware (server-side).
 *    → Instant render, zero wait, immune to ad blockers.
 * 2. If no cookie (e.g. direct localhost dev, middleware bypassed):
 *    fall back to client-side VWO polling (original behaviour).
 *
 * When server-side cookie is used, we also call window.VWO.setVariation
 * so VWO's reporting knows which variation this user was assigned.
 */

const COOKIE_MAP = {
  4: "vwo_campaign_4",
  5: "vwo_campaign_5",
};

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? Number(decodeURIComponent(match[1])) : null;
}

export function useVwoExperiment(campaignId) {
  const cookieName = COOKIE_MAP[campaignId];
  const serverVariation = cookieName ? readCookie(cookieName) : null;

  const [variationId, setVariationId] = useState(serverVariation);
  const [isLoading, setIsLoading] = useState(serverVariation == null);
  const resolvedRef = useRef(serverVariation != null);

  useEffect(() => {
    // ── Path A: server-side cookie present ───────────────────────────────────
    if (serverVariation != null) {
      // Inform VWO which variation the server assigned so reports stay accurate.
      window.VWO = window.VWO || [];
      window.VWO.push(["setVariation", [{ e: campaignId, v: serverVariation }]]);
      return;
    }

    // ── Path B: no cookie — client-side fallback ─────────────────────────────
    if (!campaignId) {
      queueMicrotask(() => { setVariationId(1); setIsLoading(false); });
      return;
    }

    const resolve = (id) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      setVariationId(id ?? 1);
      setIsLoading(false);
    };

    const activate = () => {
      window.VWO = window.VWO || [];
      const abData = window.AB_TEST_DATA;
      if (abData) {
        window.VWO.push(["tag", "Platform_Version", abData.platform_version]);
        window.VWO.push(["tag", "Migration_Group", abData.migration_group]);
      }
      window.VWO.push(["activate", campaignId]);

      const deadline = Date.now() + 2500;
      const poll = setInterval(() => {
        const variation = window._vwo_exp?.[campaignId]?.combination_chosen;
        if (variation != null) {
          clearInterval(poll);
          resolve(Number(variation));
        } else if (Date.now() >= deadline) {
          clearInterval(poll);
          resolve(1);
        }
      }, 100);

      return poll;
    };

    let pollHandle;
    if (window.AB_TEST_DATA) {
      pollHandle = activate();
    } else {
      const onReady = () => { pollHandle = activate(); };
      window.addEventListener("abTestDataReady", onReady, { once: true });
      if (window.AB_TEST_DATA) {
        window.removeEventListener("abTestDataReady", onReady);
        pollHandle = activate();
      }
    }

    return () => { if (pollHandle) clearInterval(pollHandle); };
  }, [campaignId, serverVariation]);

  return { variationId, isLoading };
}

export function trackVwoGoal(campaignId, goalId, metricKey) {
  try {
    window.VWO = window.VWO || [];
    window.VWO.push(["track.goals", goalId, { campaignId }]);
    if (metricKey) {
      window.VWO.push(["track.goals", metricKey]);
    }
  } catch {
    // Never let analytics errors break user flow.
  }
}

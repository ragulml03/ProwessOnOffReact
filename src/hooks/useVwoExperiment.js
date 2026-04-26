import { useState, useEffect, useRef } from "react";

/**
 * useVwoExperiment — flicker-free VWO A/B test hook for React.
 *
 * Design contract
 * ───────────────
 * 1. Reads window.AB_TEST_DATA (injected by .NET middleware in production,
 *    or fetched via /api/ab-test-context in dev).
 * 2. Calls window.VWO.push(["activate", campaignId]) to ask VWO to assign
 *    a variation without letting VWO mutate the DOM itself.
 * 3. Polls window._vwo_exp[campaignId].combination_chosen until VWO responds
 *    or the 2-second timeout elapses (fallback → Control).
 * 4. Returns { variationId, isLoading } so the caller can render a skeleton
 *    while waiting and swap components once resolved.
 *
 * Variation IDs (VWO convention)
 * ─────────────────────────────
 *   1  → Control   (original design)
 *   2  → Challenger (first variation)
 *   3+ → Additional variations
 *
 * @param {number|null} campaignId  Numeric VWO campaign ID. Pass null to skip.
 * @returns {{ variationId: number|null, isLoading: boolean }}
 */
export function useVwoExperiment(campaignId) {
  const [variationId, setVariationId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (!campaignId) {
      // Defer setState out of the synchronous effect body (React 19 lint rule).
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

      // Tag the user with their platform so VWO reports can be sliced by
      // platform_version even when filtering by campaign variation.
      const abData = window.AB_TEST_DATA;
      if (abData) {
        window.VWO.push(["tag", "Platform_Version", abData.platform_version]);
        window.VWO.push(["tag", "Migration_Group", abData.migration_group]);
      }

      // Push campaign activation into VWO's queue.
      // VWO processes it immediately if already loaded, or on load otherwise.
      window.VWO.push(["activate", campaignId]);

      // Poll for combination_chosen with a 100ms interval, 5s total budget.
      // 5s covers slow mobile connections and ngrok latency; still falls back to Control.
      const deadline = Date.now() + 5000;
      const poll = setInterval(() => {
        const variation = window._vwo_exp?.[campaignId]?.combination_chosen;
        if (variation != null) {
          clearInterval(poll);
          resolve(Number(variation));
        } else if (Date.now() >= deadline) {
          clearInterval(poll);
          resolve(1); // Fallback to Control so the page always renders.
        }
      }, 100);

      return poll;
    };

    let pollHandle;

    if (window.AB_TEST_DATA) {
      // Production: AB_TEST_DATA already injected synchronously.
      pollHandle = activate();
    } else {
      // Development: wait for the async fetch in index.html to complete.
      const onReady = () => { pollHandle = activate(); };
      window.addEventListener("abTestDataReady", onReady, { once: true });

      // Guard: if the event already fired before we registered, activate now.
      // (The event is dispatched before this hook mounts in most race scenarios,
      // so we check window.AB_TEST_DATA again after the listener is registered.)
      if (window.AB_TEST_DATA) {
        window.removeEventListener("abTestDataReady", onReady);
        pollHandle = activate();
      }
    }

    return () => {
      if (pollHandle) clearInterval(pollHandle);
    };
  }, [campaignId]);

  return { variationId, isLoading };
}

/**
 * trackVwoGoal — fire a VWO conversion goal from anywhere in the app.
 *
 * @param {number} campaignId  Numeric VWO campaign ID.
 * @param {number} goalId      Numeric goal ID from VWO Dashboard → Goals.
 */
export function trackVwoGoal(campaignId, goalId, metricKey) {
  try {
    window.VWO = window.VWO || [];
    // Classic goal ID (numeric) — works with older VWO goal system.
    window.VWO.push(["track.goals", goalId, { campaignId }]);
    // Data360 metric key (string) — required for newer VWO accounts.
    if (metricKey) {
      window.VWO.push(["track.goals", metricKey]);
    }
  } catch {
    // Never let analytics throw break the user flow.
  }
}

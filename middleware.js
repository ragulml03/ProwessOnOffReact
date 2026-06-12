/* global process */
import { next } from "@vercel/edge";
import { StatsigClient } from "@statsig/js-client";

/**
 * Vercel Edge Middleware — Statsig Server-Side Experiment Assignment
 *
 * Kill switch options (fastest → slowest):
 *  A. Env var (Vercel dashboard, instant, clears existing cookies):
 *       KILL_SWITCH_CAREERS=true  or  KILL_SWITCH_PROFILE=true
 *  B. Statsig gate (Statsig dashboard, ~10s, stops new assignments only):
 *       Create gate `careers_experiment_kill_switch` → turn ON
 */

const STATSIG_CLIENT_KEY = process.env.VITE_STATSIG_CLIENT_KEY ?? "";
const NR_LICENSE_KEY     = process.env.NEW_RELIC_LICENSE_KEY   ?? "";
const NR_ACCOUNT_ID      = process.env.NEW_RELIC_ACCOUNT_ID    ?? "";
const ASSIGN_TIMEOUT_MS  = 1500;

// Env-var kill switches — set in Vercel dashboard, take effect on next request
// for ALL users including those who already have a variant cookie.
const ENV_KILL_SWITCHES = {
  careers_experiment: process.env.KILL_SWITCH_CAREERS === "true",
  profile_experiment: process.env.KILL_SWITCH_PROFILE === "true",
};

function pushToNewRelic(payload) {
  if (!NR_LICENSE_KEY) return;
  fetch("https://log-api.newrelic.com/log/v1", {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-License-Key": NR_LICENSE_KEY },
    body: JSON.stringify([{
      common: { attributes: { account_id: NR_ACCOUNT_ID } },
      logs:   [{ message: payload.logtype, attributes: payload }],
    }]),
  }).catch(() => {});
}

const PAGE_EXPERIMENTS = {
  "/app/careers": [{ name: "careers_experiment", cookie: "statsig_exp_careers" }],
  "/app/profile": [{ name: "profile_experiment", cookie: "statsig_exp_profile"  }],
};

function readCookie(header, name) {
  const m = header.match(new RegExp(`(?:^|;\\s*)${encodeURIComponent(name)}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export default async function middleware(request) {
  const { pathname } = new URL(request.url);
  const experiments  = PAGE_EXPERIMENTS[pathname];
  if (!experiments) return next();

  const cookies  = request.headers.get("cookie") || "";
  const isHttps  = request.url.startsWith("https://");
  const clearOpt = `Path=/; Max-Age=0; SameSite=Lax${isHttps ? "; Secure" : ""}`;
  const cookieOpts = (maxAge) =>
    `Path=/; Max-Age=${maxAge}; SameSite=Lax${isHttps ? "; Secure" : ""}`;

  // ── Env-var kill switch (fastest path — no Statsig call needed) ────────────
  // Clears existing variant cookies immediately so ALL users revert to "control"
  // on their very next request. Set KILL_SWITCH_CAREERS=true in Vercel env vars.
  const envKilled = experiments.filter(e => ENV_KILL_SWITCHES[e.name]);
  if (envKilled.length > 0) {
    const cookiesToClear = envKilled.filter(e => readCookie(cookies, e.cookie));
    envKilled.forEach(e => pushToNewRelic({
      logtype:      "kill_switch_activated",
      trigger:      "env_var",
      feature_flag: e.name,
      path:         pathname,
      timestamp:    new Date().toISOString(),
    }));
    if (cookiesToClear.length > 0) {
      const headers = new Headers();
      cookiesToClear.forEach(e => headers.append("Set-Cookie", `${e.cookie}=; ${clearOpt}`));
      return next({ headers });
    }
    return next();
  }

  // ── Normal flow: only process experiments where cookie is missing ───────────
  const missing = experiments.filter(e => !readCookie(cookies, e.cookie));
  if (missing.length === 0) return next();
  if (!STATSIG_CLIENT_KEY)  return next();

  // ── User identity ──────────────────────────────────────────────────────────
  const realUserId  = readCookie(cookies, "prowess_user_id");
  const anonUserId  = readCookie(cookies, "statsig_user_id");
  const userId      = realUserId ?? anonUserId ?? crypto.randomUUID();
  const isNewAnonId = !realUserId && !anonUserId;

  // ── Statsig SDK assignment ─────────────────────────────────────────────────
  const statsigClient = new StatsigClient(STATSIG_CLIENT_KEY, { userID: userId });
  try {
    await Promise.race([
      statsigClient.initializeAsync(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("statsig timeout")), ASSIGN_TIMEOUT_MS)
      ),
    ]);
  } catch {
    return next();
  }

  const setCookies = [];

  for (const exp of missing) {
    // Statsig gate kill switch — stops new assignments (~10s propagation)
    const isKilled = statsigClient.checkGate(`${exp.name}_kill_switch`);
    if (isKilled) {
      pushToNewRelic({
        logtype:      "kill_switch_activated",
        trigger:      "statsig_gate",
        feature_flag: exp.name,
        path:         pathname,
        timestamp:    new Date().toISOString(),
      });
      continue;
    }

    const experiment = statsigClient.getExperiment(exp.name);
    const variation  = experiment.get("variation", null);
    if (variation) {
      setCookies.push(`${exp.cookie}=${encodeURIComponent(variation)}; ${cookieOpts(60 * 60 * 24)}`);
      pushToNewRelic({
        logtype:      "edge_flag_assignment",
        feature_flag: exp.name,
        experiment:   exp.name,
        variation,
        user_id:      userId,
        is_new_user:  isNewAnonId,
        path:         pathname,
        timestamp:    new Date().toISOString(),
      });
    }
  }

  if (isNewAnonId && setCookies.length > 0) {
    setCookies.push(`statsig_user_id=${encodeURIComponent(userId)}; ${cookieOpts(60 * 60 * 24 * 365)}`);
  }

  if (setCookies.length === 0) return next();

  const responseHeaders = new Headers();
  for (const cookie of setCookies) responseHeaders.append("Set-Cookie", cookie);
  return next({ headers: responseHeaders });
}

export const config = {
  matcher: ["/app/careers", "/app/profile"],
};

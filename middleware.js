/* global process */
import { next } from "@vercel/edge";
import { StatsigClient } from "@statsig/js-client";

/**
 * Vercel Edge Middleware — Statsig Server-Side Experiment Assignment
 *
 * Uses Statsig's own JS client SDK for 100% accurate bucketing.
 * Statsig's servers decide the assignment; we just read + cookie it.
 *
 * Flow:
 *  1. If experiment cookie already exists → pass through immediately.
 *  2. Resolve user identity from existing cookies or generate a new UUID.
 *  3. Initialize Statsig SDK for this user (calls Statsig's assignment API).
 *  4. Read variation via getExperiment() — exact Statsig bucketing, no hashing.
 *  5. Set cookie before HTML is served → React reads it instantly, zero flash.
 */

const STATSIG_CLIENT_KEY = process.env.VITE_STATSIG_CLIENT_KEY ?? "";
const ASSIGN_TIMEOUT_MS  = 1500; // fail-safe: if Statsig is slow, skip → control

// Map each page path to its experiment name + cookie name.
const PAGE_EXPERIMENTS = {
  "/app/careers": [{ name: "careers_experiment", cookie: "statsig_exp_careers" }],
  "/app/profile": [{ name: "profile_experiment", cookie: "statsig_exp_profile"  }],
};

function readCookie(header, name) {
  const m = header.match(
    new RegExp(`(?:^|;\\s*)${encodeURIComponent(name)}=([^;]*)`)
  );
  return m ? decodeURIComponent(m[1]) : null;
}

export default async function middleware(request) {
  const { pathname } = new URL(request.url);
  const experiments  = PAGE_EXPERIMENTS[pathname];
  if (!experiments) return next();

  const cookies = request.headers.get("cookie") || "";

  // Skip entirely if all experiment cookies are already set
  const missing = experiments.filter(e => !readCookie(cookies, e.cookie));
  if (missing.length === 0) return next();

  // No SDK key configured → fail gracefully, React defaults to "control"
  if (!STATSIG_CLIENT_KEY) return next();

  const isHttps = request.url.startsWith("https://");
  const cookieOpts = (maxAge) =>
    `Path=/; Max-Age=${maxAge}; SameSite=Lax${isHttps ? "; Secure" : ""}`;

  // ── User identity ──────────────────────────────────────────────────────────
  const realUserId  = readCookie(cookies, "prowess_user_id");
  const anonUserId  = readCookie(cookies, "statsig_user_id");
  const userId      = realUserId ?? anonUserId ?? crypto.randomUUID();
  const isNewAnonId = !realUserId && !anonUserId;

  // ── Statsig SDK — exact assignment (Statsig's servers, not custom hashing) ─
  const statsigClient = new StatsigClient(STATSIG_CLIENT_KEY, { userID: userId });

  try {
    await Promise.race([
      statsigClient.initializeAsync(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("statsig timeout")), ASSIGN_TIMEOUT_MS)
      ),
    ]);
  } catch {
    // Statsig unreachable or too slow → no cookie set → React defaults to "control"
    return next();
  }

  const setCookies = [];

  for (const exp of missing) {
    const experiment = statsigClient.getExperiment(exp.name);
    const variation  = experiment.get("variation", null);
    if (variation) {
      setCookies.push(
        `${exp.cookie}=${encodeURIComponent(variation)}; ${cookieOpts(60 * 60 * 24)}`
      );
    }
  }

  // Persist anonymous ID so the same user stays in the same group on future visits
  if (isNewAnonId && setCookies.length > 0) {
    setCookies.push(
      `statsig_user_id=${encodeURIComponent(userId)}; ${cookieOpts(60 * 60 * 24 * 365)}`
    );
  }

  if (setCookies.length === 0) return next();

  return next({ headers: { "Set-Cookie": setCookies.join(", ") } });
}

export const config = {
  matcher: ["/app/careers", "/app/profile"],
};

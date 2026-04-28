/* global process */
import { next } from "@vercel/edge";

/**
 * Vercel Edge Middleware — Statsig Server-Side Experiment Assignment
 *
 * Flow:
 *  1. Reads user identity from prowess_user_id cookie (set by App.jsx).
 *     Anonymous visitors fall back to statsig_user_id cookie → new UUID.
 *  2. Fetches Statsig config spec (CDN-cached, revalidated every 5 min).
 *  3. Evaluates experiments locally — no per-request API call.
 *  4. Sets experiment cookie before HTML is served — zero flash, instant render.
 *  5. React reads cookie, renders correct variant, logs impression to Statsig.
 */

const STATSIG_SERVER_KEY = process.env.STATSIG_SERVER_KEY ?? "";
const CONFIG_SPEC_URL    = `https://api.statsigcdn.com/v1/download_config_specs/${STATSIG_SERVER_KEY}`;
const FETCH_TIMEOUT      = 2000; // ms

// Map each page path to its Statsig experiment name + cookie name.
// Add new experiments here as they are created in the Statsig dashboard.
const PAGE_EXPERIMENTS = {
  "/app/careers": [{ name: "careers_experiment", cookie: "statsig_exp_careers" }],
  "/app/profile": [{ name: "profile_experiment", cookie: "statsig_exp_profile"  }],
};

// ─── MurmurHash2 (seed = 1) — matches Statsig's bucketing algorithm ──────────
function murmurHash(key) {
  let h = (1 ^ key.length) >>> 0;
  let i = 0;
  while (i + 4 <= key.length) {
    let k = (
      (key.charCodeAt(i)     & 0xff)        |
      ((key.charCodeAt(i+1) & 0xff) << 8)  |
      ((key.charCodeAt(i+2) & 0xff) << 16) |
      ((key.charCodeAt(i+3) & 0xff) << 24)
    ) >>> 0;
    k = Math.imul(k, 0x5bd1e995) >>> 0;
    k ^= k >>> 24;
    k = Math.imul(k, 0x5bd1e995) >>> 0;
    h = (Math.imul(h, 0x5bd1e995) ^ k) >>> 0;
    i += 4;
  }
  switch (key.length & 3) {
    case 3: h ^= (key.charCodeAt(i+2) & 0xff) << 16; /* falls through */
    case 2: h ^= (key.charCodeAt(i+1) & 0xff) << 8;  /* falls through */
    case 1:
      h ^= (key.charCodeAt(i) & 0xff);
      h = Math.imul(h, 0x5bd1e995) >>> 0;
  }
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

function getBucketValue(userId, salt = "") {
  return Math.floor(10000 * (murmurHash(userId + salt) / 0x100000000)) + 1;
}

// ─── Statsig config spec — fetched from CDN, cached at edge ──────────────────
let cachedSpec  = null;
let cacheExpiry = 0;

async function getConfigSpec() {
  if (cachedSpec && Date.now() < cacheExpiry) return cachedSpec;
  try {
    const res = await Promise.race([
      fetch(CONFIG_SPEC_URL),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), FETCH_TIMEOUT)
      ),
    ]);
    if (res?.ok) {
      const data = await res.json();
      cachedSpec  = data;
      cacheExpiry = Date.now() + 300_000; // 5 min
      return data;
    }
  } catch {
    // Statsig CDN slow or down — fail gracefully, React renders control
  }
  return null;
}

// ─── Experiment evaluation ────────────────────────────────────────────────────
function evaluateExperiment(spec, experimentName, userId) {
  if (!spec?.experiments) return null;

  const exp = spec.experiments.find(
    e => e.name === experimentName && e.isActive
  );
  if (!exp) return null;

  const bucket = getBucketValue(userId, exp.salt ?? experimentName);

  // Cumulative comparison — each group covers a contiguous slice of 1-10000
  let cumulative = 0;
  for (const group of exp.groups ?? []) {
    cumulative += Math.round((group.size / 100) * 10000);
    if (bucket <= cumulative) {
      // Prefer explicit "variation" parameter; fall back to group name normalised to
      // "control" / "challenger" so React's variation === "challenger" check works
      // regardless of how the group was named in the Statsig dashboard.
      const param = group.parameterValues?.variation;
      if (param != null && param !== "") return param;
      const name = (group.name ?? "").toLowerCase();
      return name === "control" ? "control" : "challenger";
    }
  }
  return null;
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────
function readCookie(header, name) {
  const m = header.match(
    new RegExp(`(?:^|;\\s*)${encodeURIComponent(name)}=([^;]*)`)
  );
  return m ? decodeURIComponent(m[1]) : null;
}

// ─── Middleware ───────────────────────────────────────────────────────────────
export default async function middleware(request) {
  const { pathname } = new URL(request.url);
  const experiments  = PAGE_EXPERIMENTS[pathname];
  if (!experiments) return next();

  const cookies  = request.headers.get("cookie") || "";
  const isHttps  = request.url.startsWith("https://");

  const EXPERIMENT_MAX_AGE = 60 * 60 * 24;       // 1 day
  const IDENTITY_MAX_AGE   = 60 * 60 * 24 * 365; // 1 year

  const cookieOpts = (maxAge) =>
    `Path=/; Max-Age=${maxAge}; SameSite=Lax${isHttps ? "; Secure" : ""}`;

  // Skip if all experiment cookies already set
  const missing = experiments.filter(e => !readCookie(cookies, e.cookie));
  if (missing.length === 0) return next();

  // ── User identity ──────────────────────────────────────────────────────────
  // 1. prowess_user_id  — real login ID written by App.jsx
  // 2. statsig_user_id  — anonymous persistent ID from prior visit
  // 3. new UUID         — brand new visitor
  const realUserId  = readCookie(cookies, "prowess_user_id");
  const anonUserId  = readCookie(cookies, "statsig_user_id");
  const userId      = realUserId ?? anonUserId ?? crypto.randomUUID();
  const isNewAnonId = !realUserId && !anonUserId;

  const spec = await getConfigSpec();

  const setCookies = [];

  for (const exp of missing) {
    const variation = evaluateExperiment(spec, exp.name, userId);
    if (variation != null) {
      setCookies.push(`${exp.cookie}=${encodeURIComponent(variation)}; ${cookieOpts(EXPERIMENT_MAX_AGE)}`);
    }
  }

  if (isNewAnonId && setCookies.length > 0) {
    setCookies.push(`statsig_user_id=${encodeURIComponent(userId)}; ${cookieOpts(IDENTITY_MAX_AGE)}`);
  }

  if (setCookies.length === 0) return next();

  return next({ headers: { "Set-Cookie": setCookies.join(", ") } });
}

export const config = {
  matcher: ["/app/careers", "/app/profile"],
};

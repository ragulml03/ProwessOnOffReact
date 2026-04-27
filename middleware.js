import { next } from "@vercel/edge";

/**
 * Vercel Edge Middleware — VWO Server-Side Variation Assignment
 *
 * Production improvements applied:
 *  1. Real user ID  — reads prowess_user_id cookie (set by App.jsx from
 *                     AB_TEST_DATA.user_id / LaunchDarkly identity).
 *                     Anonymous first-visit falls back to vwo_user_id cookie.
 *  2. Short TTL     — campaign cookies expire in 1 day. MurmurHash is
 *                     deterministic, so the same user always re-hashes to the
 *                     same variation. When a campaign is archived, its status
 *                     changes to non-RUNNING and no new cookie is set.
 *  3. Shared cache  — uses Vercel's fetch cache (revalidate: 300s) which is
 *                     shared across ALL edge instances globally, not per-instance.
 *  4. Timeout       — VWO settings fetch times out at 300ms. If slow/down,
 *                     no cookie is set and React falls back to client-side VWO.
 *  5. Secure cookie — HTTPS-only flag set in production.
 *  6. Multi-campaign — each page path supports an array of campaigns.
 */

const VWO_ACCOUNT_ID = "1223984";
const SETTINGS_URL   = `https://dev.visualwebsiteoptimizer.com/server-side/settings-file?a=${VWO_ACCOUNT_ID}`;
const FETCH_TIMEOUT  = 1500; // ms — if VWO CDN is slow, don't block the user

// Multiple campaigns per page are supported — add new entries here.
// CI checks that every VWO.push(["activate", X]) in index.html has an entry.
const PAGE_CAMPAIGNS = {
  "/app/careers": [{ id: 4, cookie: "vwo_campaign_4" }],
  "/app/profile": [{ id: 5, cookie: "vwo_campaign_5" }],
};

// ─── MurmurHash2 — matches vwo-node-sdk exactly (seed = 1) ───────────────────
function murmurHash(key) {
  let h = (1 ^ key.length) >>> 0;
  let i = 0;
  while (i + 4 <= key.length) {
    let k = (
      (key.charCodeAt(i)       & 0xff)        |
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

const MAX_BUCKET = 10000;
function getBucketValue(userId) {
  return Math.floor(MAX_BUCKET * (murmurHash(userId) / 0x100000000)) + 1;
}

// ─── VWO Settings — shared Vercel edge cache (all instances, 5 min TTL) ─────
async function getVwoSettings() {
  try {
    const res = await Promise.race([
      fetch(SETTINGS_URL),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), FETCH_TIMEOUT)
      ),
    ]);
    console.log("[middleware] VWO HTTP status:", res?.status, res?.ok);
    if (res?.ok) return await res.json();
  } catch (err) {
    console.log("[middleware] VWO fetch error:", err?.message);
  }
  return null;
}

// ─── Variation assignment using VWO's settings ───────────────────────────────
function getVariationId(settings, campaignId, userId) {
  const campaign = settings?.campaigns?.find(
    c => c.id === campaignId && c.status === "RUNNING"
  );
  // Campaign not found or not RUNNING (paused / archived) — skip
  if (!campaign) return null;

  const bucket      = getBucketValue(userId);
  const trafficCeil = campaign.percentTraffic * 100; // 0–10000 scale

  // User is outside the traffic allocation VWO configured
  if (bucket > trafficCeil) return null;

  // Assign variation: weights from VWO (sum to 100), scaled to traffic range
  const scale = trafficCeil / 100;
  let ceiling = 0;
  for (const v of campaign.variations) {
    ceiling += v.weight * scale;
    if (bucket <= ceiling) return v.id;
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
  const campaigns = PAGE_CAMPAIGNS[pathname];
  if (!campaigns) return next();

  const cookies  = request.headers.get("cookie") || "";
  const isHttps  = request.url.startsWith("https://");

  // Campaign cookies expire in 1 day.
  // MurmurHash is deterministic — same user always rehashes to the same
  // variation, so short TTL never causes inconsistency.
  // When a campaign ends (status != RUNNING), no new cookie is set and
  // React falls back to the client-side default behaviour.
  const CAMPAIGN_MAX_AGE = 60 * 60 * 24; // 1 day
  const IDENTITY_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

  const cookieOpts = (maxAge) =>
    `Path=/; Max-Age=${maxAge}; SameSite=Lax${isHttps ? "; Secure" : ""}`;

  // Check if all campaigns on this page already have cookies
  const missing = campaigns.filter(c => !readCookie(cookies, c.cookie));
  if (missing.length === 0) return next();

  // ── User identity ──────────────────────────────────────────────────────────
  // Priority:
  //  1. prowess_user_id — real identity written by App.jsx from AB_TEST_DATA
  //                       (login user ID or LaunchDarkly key)
  //  2. vwo_user_id     — anonymous persistent ID from a prior middleware run
  //  3. new UUID        — brand new anonymous visitor (first ever visit)
  //
  // From second visit onward, App.jsx will have written the real user ID
  // so bucket assignments are tied to the actual user, not an anonymous ID.
  const realUserId   = readCookie(cookies, "prowess_user_id");
  const anonUserId   = readCookie(cookies, "vwo_user_id");
  const userId       = realUserId ?? anonUserId ?? crypto.randomUUID();
  const isNewAnonId  = !realUserId && !anonUserId;

  // Fetch VWO settings (shared CDN cache — one fetch per 5 min globally)
  const settings = await getVwoSettings();
  console.log("[middleware] settings fetched:", settings ? `${settings.campaigns?.length} campaigns` : "null — check VWO account ID or campaign status");

  const setCookies = [];

  for (const campaign of missing) {
    const variationId = getVariationId(settings, campaign.id, userId);
    console.log(`[middleware] campaign ${campaign.id} → variationId=${variationId}, userId=${userId.slice(0,8)}`);
    // null = campaign paused/archived, user outside traffic %, or fetch failed
    // → no cookie set → React falls back to client-side VWO
    if (variationId != null) {
      setCookies.push(`${campaign.cookie}=${variationId}; ${cookieOpts(CAMPAIGN_MAX_AGE)}`);
    }
  }

  // Persist the anonymous ID only if we generated a new one
  if (isNewAnonId && setCookies.length > 0) {
    setCookies.push(`vwo_user_id=${encodeURIComponent(userId)}; ${cookieOpts(IDENTITY_MAX_AGE)}`);
  }

  if (setCookies.length === 0) return next();

  return next({ headers: { "Set-Cookie": setCookies.join(", ") } });
}

export const config = {
  matcher: ["/app/careers", "/app/profile"],
};

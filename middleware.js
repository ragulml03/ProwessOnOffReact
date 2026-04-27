import { next } from "@vercel/edge";

/**
 * Vercel Edge Middleware — VWO Server-Side Variation Assignment
 *
 * Uses VWO's own settings file + MurmurHash2 algorithm (same as vwo-node-sdk).
 * VWO controls traffic split, variation weights, and targeting — this middleware
 * just executes the bucketing before the browser loads, eliminating the skeleton
 * loader and making the assignment immune to ad blockers.
 *
 * Flow:
 *  1. Fetch VWO settings file (cached 5 min — same file VWO SmartCode uses)
 *  2. Find the campaign by ID — if paused/not found, skip (client-side handles it)
 *  3. Hash userId with MurmurHash2 (seed=1, matches VWO SDK exactly)
 *  4. Check traffic allocation (percentTraffic from VWO dashboard)
 *  5. Assign variation using weights from VWO dashboard
 *  6. Set cookie → React reads it instantly, calls setVariation to inform VWO
 */

const VWO_ACCOUNT_ID = "1223984";

const PAGE_CAMPAIGNS = {
  "/app/careers": { id: 4, cookie: "vwo_campaign_4" },
  "/app/profile": { id: 5, cookie: "vwo_campaign_5" },
};

// ─── MurmurHash2 — matches VWO SDK (vwo-node-sdk) exactly ────────────────────
// Seed 1 is hardcoded in VWO's SDK. Changing it would produce different buckets.
function murmurHash(key) {
  let h = (1 ^ key.length) >>> 0;
  let i = 0;
  while (i + 4 <= key.length) {
    let k = (
      (key.charCodeAt(i)      ) |
      (key.charCodeAt(i+1) << 8) |
      (key.charCodeAt(i+2) << 16)|
      (key.charCodeAt(i+3) << 24)
    ) >>> 0;
    k = Math.imul(k, 0x5bd1e995) >>> 0;
    k ^= k >>> 24;
    k = Math.imul(k, 0x5bd1e995) >>> 0;
    h = (Math.imul(h, 0x5bd1e995) ^ k) >>> 0;
    i += 4;
  }
  switch (key.length & 3) {
    case 3: h ^= (key.charCodeAt(i+2) & 0xff) << 16;
    /* falls through */
    case 2: h ^= (key.charCodeAt(i+1) & 0xff) << 8;
    /* falls through */
    case 1:
      h ^= (key.charCodeAt(i) & 0xff);
      h = Math.imul(h, 0x5bd1e995) >>> 0;
  }
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h >>> 0;
}

// Bucket value 1–10000, same scale VWO uses internally
const MAX_BUCKET = 10000;
function getBucketValue(userId) {
  return Math.floor(MAX_BUCKET * (murmurHash(userId) / 0x100000000)) + 1;
}

// ─── VWO Settings File — fetched once, cached for 5 minutes ──────────────────
// This is the same file VWO's SmartCode downloads in the browser.
// It contains all campaigns, their status, traffic %, and variation weights.
let _cachedSettings = null;
let _cacheExpiry    = 0;

async function getVwoSettings() {
  if (_cachedSettings && Date.now() < _cacheExpiry) return _cachedSettings;
  try {
    const res = await fetch(
      `https://dev.visualwebsiteoptimizer.com/server-side/settings-file?a=${VWO_ACCOUNT_ID}`,
      { headers: { "Accept": "application/json" } }
    );
    if (res.ok) {
      _cachedSettings = await res.json();
      _cacheExpiry    = Date.now() + 5 * 60 * 1000; // 5 min TTL
    }
  } catch {
    // Network error — return stale cache if available, else null
  }
  return _cachedSettings;
}

// ─── Variation assignment using VWO's own campaign settings ──────────────────
function getVariationFromSettings(settings, campaignId, userId) {
  const campaign = settings?.campaigns?.find(
    c => c.id === campaignId && c.status === "RUNNING"
  );

  // Campaign not found or paused — skip, let client-side VWO handle it
  if (!campaign) return null;

  const bucket = getBucketValue(userId);

  // Traffic allocation: VWO dashboard controls what % of users enter the test
  // e.g. percentTraffic=50 means only half of all visitors are bucketed
  const trafficCeiling = campaign.percentTraffic * 100; // scale to 0–10000
  if (bucket > trafficCeiling) return null; // user not in this test

  // Variation assignment: weights from VWO dashboard (sum to 100)
  // Scale weights to match bucket range within traffic ceiling
  const weightScale = trafficCeiling / 100;
  let ceiling = 0;
  for (const variation of campaign.variations) {
    ceiling += variation.weight * weightScale;
    if (bucket <= ceiling) return variation.id;
  }

  return null;
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────
function readCookie(header, name) {
  const m = header.match(new RegExp(`(?:^|;\\s*)${encodeURIComponent(name)}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

// ─── Middleware entry point ───────────────────────────────────────────────────
export default async function middleware(request) {
  const { pathname } = new URL(request.url);
  const campaign = PAGE_CAMPAIGNS[pathname];

  // Not an A/B test page — pass through immediately
  if (!campaign) return next();

  const cookies = request.headers.get("cookie") || "";

  // Already bucketed — serve the stored variation (sticky bucketing)
  if (readCookie(cookies, campaign.cookie)) return next();

  // Get or create a stable user ID (persists 30 days)
  const userId = readCookie(cookies, "vwo_user_id") ?? crypto.randomUUID();

  // Ask VWO's settings what variation this user should see
  const settings    = await getVwoSettings();
  const variationId = getVariationFromSettings(settings, campaign.id, userId);

  // VWO says user is not in this test (not in traffic %, or campaign paused)
  // → No cookie set → React falls back to client-side VWO as normal
  if (variationId == null) return next();

  const maxAge = 60 * 60 * 24 * 30; // 30 days
  const opts   = `Path=/; Max-Age=${maxAge}; SameSite=Lax`;

  return next({
    headers: {
      "Set-Cookie": [
        `${campaign.cookie}=${variationId}; ${opts}`,
        `vwo_user_id=${encodeURIComponent(userId)}; ${opts}`,
      ].join(", "),
    },
  });
}

export const config = {
  matcher: ["/app/careers", "/app/profile"],
};

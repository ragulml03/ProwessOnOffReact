import { next } from "@vercel/edge";

/**
 * Vercel Edge Middleware — VWO Server-Side Variation Assignment
 *
 * Runs at the CDN edge BEFORE the React app loads.
 * Assigns the VWO variation for A/B campaigns using deterministic bucketing,
 * stores it in a cookie, and informs VWO via setVariation on the client.
 *
 * Result: zero skeleton wait, zero ad-blocker vulnerability.
 */

const CAMPAIGNS = {
  "/app/careers": { id: 4, cookie: "vwo_campaign_4" },
  "/app/profile": { id: 5, cookie: "vwo_campaign_5" },
};

// Deterministic bucketing — same user always gets same variation.
// Uses djb2 hash of userId + campaignId for even 50/50 distribution.
function assignVariation(userId, campaignId) {
  const input = `${userId}_${campaignId}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return (hash % 2) === 0 ? 1 : 2; // 1 = Control, 2 = Challenger
}

function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function middleware(request) {
  const { pathname } = new URL(request.url);
  const campaign = CAMPAIGNS[pathname];

  // Only intercept A/B test pages
  if (!campaign) return next();

  const cookieHeader = request.headers.get("cookie") || "";

  // Already assigned — let the cached variation stand (sticky bucketing)
  if (parseCookie(cookieHeader, campaign.cookie)) return next();

  // Get or create a stable user ID
  const userId =
    parseCookie(cookieHeader, "vwo_user_id") ?? crypto.randomUUID();

  const variationId = assignVariation(userId, campaign.id);

  const maxAge = 60 * 60 * 24 * 30; // 30 days — match experiment duration
  const cookieOpts = `Path=/; Max-Age=${maxAge}; SameSite=Lax`;

  return next({
    headers: {
      // Set variation cookie — React reads this instantly on mount
      "Set-Cookie": [
        `${campaign.cookie}=${variationId}; ${cookieOpts}`,
        `vwo_user_id=${userId}; ${cookieOpts}`,
      ].join(", "),
    },
  });
}

export const config = {
  matcher: ["/app/careers", "/app/profile"],
};

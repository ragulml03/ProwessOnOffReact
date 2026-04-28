import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useFlags, useLDClient } from "launchdarkly-react-client-sdk";
import ReactBadge from "../components/ReactBadge";
import { useExperiment, trackExperimentGoal } from "../hooks/useExperiment";
import { useStatsigClient } from "@statsig/react-bindings";
import {
  trackVwoVariationAssigned,
  trackVwoGoalConverted,
  trackLdConversion,
  trackLdFlagEvaluated,
  trackProfileAction as trackProfileActionPinpoint,
} from "../analytics/pinpoint.js";

const EXPERIMENT_KEY    = "profile";
const STATSIG_GOAL_NAME = "profile_action";

// ─── Action feedback modal ────────────────────────────────────────────────────
const ACTION_CONTENT = {
  "edit-profile": {
    icon: "✅",
    title: "Profile is Up to Date",
    body: "Your profile information looks great! No changes are needed right now. You can update your name, email, or role at any time.",
    cta: "Got it!",
    iconChallenger: "✨",
    titleChallenger: "You're All Set!",
    bodyChallenger: "Everything on your profile is current. Make a change whenever you like — we save it instantly.",
    ctaChallenger: "Awesome!",
  },
  "manage-billing": {
    icon: "💳",
    title: "Billing is Managed",
    body: "Your current plan is active and your next billing cycle is running smoothly. Contact support if you need to upgrade, downgrade, or cancel.",
    cta: "Close",
    iconChallenger: "🚀",
    titleChallenger: "Your Plan is Active",
    bodyChallenger: "Everything looks good on the billing front. Upgrade or change your plan any time — we'll prorate the difference automatically.",
    ctaChallenger: "Nice, Thanks!",
  },
};

function ProfileActionModal({ action, isChallenger, onClose }) {
  const content = ACTION_CONTENT[action];
  if (!content) return null;

  const icon  = isChallenger ? content.iconChallenger  : content.icon;
  const title = isChallenger ? content.titleChallenger : content.title;
  const body  = isChallenger ? content.bodyChallenger  : content.body;
  const cta   = isChallenger ? content.ctaChallenger   : content.cta;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`relative max-w-md w-full rounded-2xl p-8 shadow-2xl border
        ${isChallenger
          ? "bg-[#0a1f1a] border-emerald-400/30 shadow-emerald-900/40"
          : "bg-[#010f24] border-[#405BFF]/30 shadow-[#405BFF]/20"
        }`}>

        {/* Variation badge */}
        <div className="mb-5">
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-widest border
            ${isChallenger
              ? "bg-emerald-400/10 border-emerald-400/30 text-emerald-300"
              : "bg-[#405BFF]/10 border-[#405BFF]/30 text-[#405BFF]"
            }`}>
            {isChallenger ? "★ Challenger Variation" : "Control Variation"} — Conversion Recorded
          </span>
        </div>

        <div className="text-5xl mb-4">{icon}</div>
        <h2 className="text-2xl font-bold text-white mb-3">{title}</h2>
        <p className={`text-sm leading-relaxed mb-6 ${isChallenger ? "text-emerald-100/60" : "text-white/55"}`}>
          {body}
        </p>

        <button
          onClick={onClose}
          className={`w-full py-3 rounded-xl font-semibold text-white transition-all duration-150
            ${isChallenger
              ? "bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-900/40"
              : "bg-[#405BFF] hover:bg-[#3350EE] shadow-lg shadow-[#405BFF]/25"
            }`}>
          {cta}
        </button>
      </div>
    </div>
  );
}

// ─── Control: plain stat card (original) ─────────────────────────────────────
function StatCardControl({ stat }) {
  return (
    <div className="bg-white/3 border border-white/8 rounded-xl p-5">
      <p className="text-3xl font-bold text-white mb-1">{stat.value ?? "-"}</p>
      <p className="text-white/40 text-sm">{stat.label ?? "Metric"}</p>
    </div>
  );
}

// ─── Challenger: stat card with colour accent + trend indicator ───────────────
// Tests whether richer visual context drives more "Edit Profile" / "Manage Billing" clicks.
const CARD_ACCENTS = [
  { bg: "bg-[#405BFF]/10", border: "border-[#405BFF]/20", text: "text-[#405BFF]", trend: "+12%" },
  { bg: "bg-emerald-400/10", border: "border-emerald-400/20", text: "text-emerald-300", trend: "+8%" },
  { bg: "bg-violet-400/10", border: "border-violet-400/20", text: "text-violet-300", trend: "+5%" },
  { bg: "bg-amber-400/10", border: "border-amber-400/20", text: "text-amber-300", trend: "–2%" },
];

function StatCardChallenger({ stat, index }) {
  const accent = CARD_ACCENTS[index % CARD_ACCENTS.length];
  const isPositive = !accent.trend.startsWith("–");
  return (
    <div className={`${accent.bg} border ${accent.border} rounded-xl p-5`}>
      <div className="flex items-start justify-between mb-1">
        <p className="text-3xl font-bold text-white">{stat.value ?? "-"}</p>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-1
          ${isPositive ? "bg-emerald-400/10 text-emerald-300" : "bg-red-400/10 text-red-300"}`}>
          {isPositive ? "↑" : "↓"} {accent.trend}
        </span>
      </div>
      <p className={`text-sm font-medium ${accent.text}`}>{stat.label ?? "Metric"}</p>
      <p className="text-white/25 text-xs mt-1">vs last month</p>
    </div>
  );
}

export default function ProfilePage({ siteData }) {
  const user = siteData?.profile?.user ?? {};
  const stats = Array.isArray(siteData?.profile?.stats) ? siteData.profile.stats : [];
  const flags = Array.isArray(siteData?.profile?.recentFlags) ? siteData.profile.recentFlags : [];
  useFlags();
  const ldClient = useLDClient();

  // ── Statsig Experiment: Profile stat card layout ──────────────────────────
  const { variation: profileVariation } = useExperiment(EXPERIMENT_KEY);
  const isProfileChallenger = profileVariation === "challenger";
  const { client: statsigClient } = useStatsigClient();

  const [activeAction, setActiveAction] = useState(null);

  // Fire once when experiment resolves — log to Pinpoint for funnel tracking
  useEffect(() => {
    const variationLabel = isProfileChallenger ? "Challenger" : "Control";
    trackVwoVariationAssigned(EXPERIMENT_KEY, profileVariation, variationLabel, "profile");
  }, [profileVariation, isProfileChallenger]);

  // Event 5 — fire once when LD flags are available
  useEffect(() => {
    const userId = window.AB_TEST_DATA?.user_id ?? "";
    trackLdFlagEvaluated("reactMigrationTest", true, userId);
  }, []);

  const trackProfileAction = (action) => {
    const variationLabel = isProfileChallenger ? "Challenger" : "Control";
    const platform = window.AB_TEST_DATA?.platform_version ?? "react_modern";

    // 1. Statsig goal event
    trackExperimentGoal(statsigClient, "profile_experiment", STATSIG_GOAL_NAME, { action });
    // 2. Pinpoint mirror
    trackVwoGoalConverted(EXPERIMENT_KEY, 1, STATSIG_GOAL_NAME, { action });
    // 3. LD conversion + Pinpoint mirror
    ldClient?.track("profile-action", { source: "react-profile", action, variation: variationLabel });
    trackLdConversion("profile-action", { source: "react-profile", variation_label: variationLabel });
    // 4. Pinpoint profile action
    trackProfileActionPinpoint(action, variationLabel, platform);

    setActiveAction(action);
  };

  return (
    <>
    {activeAction && (
      <ProfileActionModal
        action={activeAction}
        isChallenger={isProfileChallenger}
        onClose={() => setActiveAction(null)}
      />
    )}
    <section className="pt-12 pb-28 px-6">
      <div className="mx-auto max-w-5xl">
        <ReactBadge />

        {/* User header */}
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-10">
          <div className="w-16 h-16 rounded-2xl bg-[#405BFF] flex items-center justify-center text-xl font-bold text-white shrink-0">
            {user.avatarInitials ?? "OO"}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{user.name ?? "OffOn User"}</h1>
            <p className="text-white/40 text-sm mt-0.5">{user.email ?? "user@offon.com"}</p>
          </div>
          <div className="md:ml-auto flex items-center gap-3">
            <span className="text-xs font-semibold text-[#405BFF] bg-[#405BFF]/10 border border-[#405BFF]/25 px-3 py-1.5 rounded-full uppercase tracking-wider">
              {user.plan ?? "Enterprise"}
            </span>
            <span className="text-xs font-semibold text-white/50 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
              {user.role ?? "Admin"}
            </span>
          </div>
        </div>

        {/* ── Stats grid: Control vs Challenger ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {stats.map((stat, index) =>
            isProfileChallenger
              ? <StatCardChallenger key={`${stat.label}-${index}`} stat={stat} index={index} />
              : <StatCardControl    key={`${stat.label}-${index}`} stat={stat} />
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent flags */}
          <div className="lg:col-span-2 bg-white/3 border border-white/8 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
              <h2 className="font-semibold text-sm">Recent Feature Flags</h2>
              <Link to="/app/careers" className="text-xs text-[#405BFF] transition-colors hover:text-white/70">
                View all
              </Link>
            </div>
            <div className="divide-y divide-white/5">
              {flags.map((flag, index) => (
                <div key={`${flag.name ?? "flag"}-${index}`} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${flag.status === "On" ? "bg-green-400" : "bg-white/20"}`} />
                    <span className="text-sm font-mono text-white/80 truncate">{flag.name ?? "feature.flag"}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-sm text-white/35">
                    <span className="text-xs bg-white/5 border border-white/8 px-2 py-0.5 rounded">{flag.environment ?? "N/A"}</span>
                    <span>{flag.updatedAt ?? "-"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Account details — buttons tracked as conversion goal */}
          <div className="bg-white/3 border border-white/8 rounded-xl p-6">
            <h2 className="font-semibold text-sm mb-5">Account Details</h2>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Member Since</p>
                <p className="text-sm text-white/70">{user.joinDate ?? "-"}</p>
              </div>
              <div>
                <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Current Plan</p>
                <p className="text-sm text-white/70">{user.plan ?? "Enterprise"}</p>
              </div>
              <div>
                <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Role</p>
                <p className="text-sm text-white/70">{user.role ?? "Admin"}</p>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/8 space-y-2.5">
              <button
                onClick={() => trackProfileAction("edit-profile")}
                className="profile-cta w-full text-sm bg-[#405BFF] hover:bg-[#3350EE] text-white py-2.5 rounded-lg font-medium transition-colors"
              >
                Edit Profile
              </button>
              <button
                onClick={() => trackProfileAction("manage-billing")}
                className="profile-cta w-full text-sm border border-white/10 hover:border-white/25 text-white/50 hover:text-white py-2.5 rounded-lg transition-colors"
              >
                Manage Billing
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
    </>
  );
}

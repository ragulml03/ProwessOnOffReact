import { useState, useEffect } from "react";
import { useFeatureGate, useStatsigClient } from "@statsig/react-bindings";
import ReactBadge from "../components/ReactBadge";
import { useExperiment, trackExperimentGoal } from "../hooks/useExperiment";
import {
  trackVwoVariationAssigned,
  trackVwoGoalConverted,
  trackApplyClick,
} from "../analytics/pinpoint.js";

const EXPERIMENT_KEY    = "careers";
const STATSIG_GOAL_NAME = "apply_click";

// ─── Skeleton loader ─────────────────────────────────────────────────────────
function CareersPageSkeleton() {
  return (
    <div className="animate-pulse px-6 pt-24 pb-28">
      <div className="mx-auto max-w-3xl text-center mb-12">
        <div className="h-6 bg-white/10 rounded-full w-28 mx-auto mb-8" />
        <div className="h-10 bg-white/10 rounded w-3/4 mx-auto mb-4" />
        <div className="h-4 bg-white/10 rounded w-1/2 mx-auto" />
      </div>
      <div className="mx-auto max-w-4xl space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 bg-white/5 rounded-xl border border-white/8" />
        ))}
      </div>
    </div>
  );
}

// ─── Apply success modal ──────────────────────────────────────────────────────
// Control = blue theme, Challenger = emerald theme.
function ApplySuccessModal({ isChallenger, job, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className={`relative max-w-md w-full rounded-2xl p-8 shadow-2xl border
          ${isChallenger
            ? "bg-[#0a1f1a] border-emerald-400/30 shadow-emerald-900/40"
            : "bg-[#010f24] border-[#405BFF]/30 shadow-[#405BFF]/20"
          }`}
      >
        {/* Variation badge */}
        <div className="mb-5">
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-widest border
              ${isChallenger
                ? "bg-emerald-400/10 border-emerald-400/30 text-emerald-300"
                : "bg-[#405BFF]/10 border-[#405BFF]/30 text-[#405BFF]"
              }`}
          >
            {isChallenger ? "★ Challenger Variation" : "Control Variation"} — Conversion Recorded
          </span>
        </div>

        {/* Icon */}
        <div className="text-5xl mb-4">{isChallenger ? "🚀" : "✅"}</div>

        {/* Headline */}
        <h2 className="text-2xl font-bold text-white mb-3">
          {isChallenger ? "You're on Your Way!" : "Application Received!"}
        </h2>

        {/* Body */}
        <p className={`text-sm leading-relaxed mb-5 ${isChallenger ? "text-emerald-100/60" : "text-white/55"}`}>
          {isChallenger
            ? <>Amazing move! We've received your application for <strong className="text-white">{job?.title}</strong>. We're excited to learn more about you — expect to hear from us within <strong className="text-emerald-300">2 business days</strong>. Go get 'em! 🌟</>
            : <>Thank you for applying for <strong className="text-white">{job?.title}</strong>. Our team will carefully review your application and get back to you within <strong className="text-[#405BFF]">5 business days</strong>. Good luck! 🎯</>
          }
        </p>

        {/* Next steps */}
        <div
          className={`text-xs rounded-xl p-4 mb-6 border
            ${isChallenger
              ? "bg-emerald-400/8 border-emerald-400/15 text-emerald-200/60"
              : "bg-[#405BFF]/8 border-[#405BFF]/15 text-white/45"
            }`}
        >
          <p className="font-semibold mb-1 text-white/70">What happens next?</p>
          <p>Check your email for a confirmation. Our hiring team will review your profile and reach out with interview details.</p>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className={`w-full py-3 rounded-xl font-semibold text-white transition-all duration-150
            ${isChallenger
              ? "bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-900/40"
              : "bg-[#405BFF] hover:bg-[#3350EE] shadow-lg shadow-[#405BFF]/25"
            }`}
        >
          {isChallenger ? "Awesome, I'm Ready!" : "Got it, Thanks!"}
        </button>
      </div>
    </div>
  );
}

// ─── Shared Apply button ──────────────────────────────────────────────────────
function ApplyButton({ isChallenger, onClick }) {
  return isChallenger ? (
    <button
      onClick={onClick}
      className="apply-btn text-sm font-semibold text-white bg-[#405BFF] hover:bg-[#3350EE] px-5 py-2 rounded-lg transition-all duration-150 whitespace-nowrap shadow-lg shadow-[#405BFF]/20"
    >
      Start Your Journey →
    </button>
  ) : (
    <button
      onClick={onClick}
      className="apply-btn text-sm text-[#405BFF] group-hover:text-white border border-[#405BFF]/30 group-hover:bg-[#405BFF] group-hover:border-[#405BFF] px-4 py-2 rounded-lg transition-all duration-150 font-medium whitespace-nowrap"
    >
      Apply Now
    </button>
  );
}

// ─── Job card ─────────────────────────────────────────────────────────────────
function JobCard({ job, index, isChallenger, onApply }) {
  return (
    <div className="group bg-white/3 border border-white/8 rounded-xl p-6 hover:bg-[#405BFF]/6 hover:border-[#405BFF]/25 transition-all duration-200 cursor-pointer">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-[#405BFF] bg-[#405BFF]/10 border border-[#405BFF]/20 px-2.5 py-1 rounded-full">
              {job.department ?? "Engineering"}
            </span>
            <span className="text-xs text-white/30 bg-white/5 border border-white/8 px-2.5 py-1 rounded-full">
              {job.type ?? "Full Time"}
            </span>
            {isChallenger && index === 0 && (
              <span className="text-xs font-semibold text-emerald-300 bg-emerald-300/10 border border-emerald-300/20 px-2.5 py-1 rounded-full">
                ★ Featured
              </span>
            )}
          </div>
          <h3 className="text-lg font-semibold text-white mb-1.5">{job.title ?? "Role"}</h3>
          <p className="text-white/45 text-sm leading-relaxed">{job.description ?? ""}</p>
        </div>
        <div className="flex md:flex-col items-start md:items-end gap-3 md:gap-2 shrink-0">
          <span className="text-white/35 text-sm flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {job.location ?? "Remote"}
          </span>
          <ApplyButton isChallenger={isChallenger} onClick={() => onApply(job)} />
        </div>
      </div>
    </div>
  );
}

// ─── Control hero ─────────────────────────────────────────────────────────────
function ControlHero({ siteData }) {
  return (
    <section className="pt-24 pb-16 px-6">
      <div className="mx-auto max-w-3xl text-center">
        <ReactBadge />
        <div className="inline-flex items-center gap-2 bg-[#405BFF]/10 border border-[#405BFF]/30 text-[#405BFF] text-xs font-semibold px-4 py-2 rounded-full mb-8 uppercase tracking-widest">
          We&apos;re Hiring
        </div>
        <h1 className="text-4xl md:text-5xl font-bold mb-5 leading-tight">
          {siteData?.careers?.pageTitle ?? "Careers"}
        </h1>
        <p className="text-white/50 text-lg leading-relaxed">
          {siteData?.careers?.pageSubtitle ?? "Grow your career with OffOn."}
        </p>
      </div>
    </section>
  );
}

// ─── Challenger hero ──────────────────────────────────────────────────────────
function ChallengerHero({ siteData }) {
  return (
    <section className="pt-24 pb-16 px-6">
      <div className="mx-auto max-w-3xl text-center">
        <ReactBadge />
        <div className="inline-flex items-center gap-2 bg-emerald-400/10 border border-emerald-400/30 text-emerald-300 text-xs font-semibold px-4 py-2 rounded-full mb-8 uppercase tracking-widest">
          Actively Hiring — Join the Mission
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold mb-5 leading-tight bg-gradient-to-r from-white to-[#405BFF] bg-clip-text text-transparent">
          Shape What&apos;s Next
        </h1>
        <p className="text-white/60 text-xl leading-relaxed">
          {siteData?.careers?.pageSubtitle ?? "Build the future of feature delivery with our world-class team."}
        </p>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CareersPage({ siteData }) {
  const jobs = Array.isArray(siteData?.careers?.jobs) ? siteData.careers.jobs : [];
  const { value: reactMigrationTest } = useFeatureGate("react_migration_test");

  const { variation, isLoading } = useExperiment(EXPERIMENT_KEY);
  const isChallenger = variation === "challenger";
  const { client: statsigClient } = useStatsigClient();

  const [appliedJob, setAppliedJob] = useState(null);

  // Fire once when experiment resolves — log to Pinpoint for funnel tracking
  useEffect(() => {
    if (isLoading) return;
    const variationLabel = isChallenger ? "Challenger" : "Control";
    trackVwoVariationAssigned(EXPERIMENT_KEY, variation, variationLabel, "careers");
  }, [isLoading, variation, isChallenger]);

  const trackApply = (job) => {
    const variationLabel = isChallenger ? "Challenger" : "Control";
    const platform = window.AB_TEST_DATA?.platform_version ?? "react_modern";

    // 1. Statsig goal event
    trackExperimentGoal(statsigClient, "careers_experiment", STATSIG_GOAL_NAME, { job_title: job?.title ?? "" });
    // 2. Pinpoint mirror
    trackVwoGoalConverted(EXPERIMENT_KEY, 1, STATSIG_GOAL_NAME, { job_title: job?.title ?? "" });
    // 3. Pinpoint apply click
    trackApplyClick(job?.title, variationLabel, platform);

    setAppliedJob(job);
  };

  if (isLoading) return <CareersPageSkeleton />;

  return (
    <>
      {appliedJob && (
        <ApplySuccessModal
          isChallenger={isChallenger}
          job={appliedJob}
          onClose={() => setAppliedJob(null)}
        />
      )}

      {isChallenger ? (
        <ChallengerHero siteData={siteData} />
      ) : (
        <ControlHero siteData={siteData} />
      )}

      {reactMigrationTest && (
        <div className="text-center text-xs tracking-wider uppercase text-emerald-300 -mt-8 mb-4">
          Live Experiment Active — Statsig: {variation ?? "control"}{" "}
          ({isChallenger ? "Challenger" : "Control"})
        </div>
      )}

      <section className="pb-28 px-6">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm text-white/30 uppercase tracking-widest font-semibold mb-6">
            {jobs.length} Open Roles
          </p>
          <div className="space-y-3">
            {jobs.map((job, index) => (
              <JobCard
                key={`${job.title ?? "job"}-${job.location ?? "loc"}-${index}`}
                job={job}
                index={index}
                isChallenger={isChallenger}
                onApply={trackApply}
              />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

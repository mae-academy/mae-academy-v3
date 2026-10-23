/**
 * MAE Academy - Social Metrics Component Suite
 * 
 * 1. SocialMetricsBar (Hero):
 *    Compact, horizontally-aligned inline row placed directly below the CTA buttons
 *    ("Launch a Simulation" & "Explore Library") and directly above the "Chat with MAE AI" banner.
 *    Displays Total Views, Community, Reactions, and @mae.academy badge.
 *    Total Views rolls like a mechanical odometer: each changing digit slides up from below.
 * 
 * 2. SocialPlatformBreakdown (Bottom):
 *    Granular Instagram & Facebook cards positioned right above the Founder section.
 */

import React, { useEffect, useRef, useState } from "react";
import { Eye, Users, Heart, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  INITIAL_SOCIAL_METRICS,
  SocialMetricsSnapshot,
} from "@/data/socialMetricsData";

/* =========================================================================
   NUMBER FORMATTING UTILITIES
   ========================================================================= */

export function formatWithCommas(num: number): string {
  return new Intl.NumberFormat("en-US").format(Math.floor(num));
}

export function formatCompact(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M+";
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "k+";
  return num.toString();
}

/* =========================================================================
   BRAND LOGOS
   ========================================================================= */

export function InstagramIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export function FacebookIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.82 0-1.667.417-1.667 1.623v2.366h4.161l-.645 3.667h-3.516v7.98c-1.397.098-2.825.101-4.223 0Z" />
    </svg>
  );
}

/* =========================================================================
   VERTICAL ODOMETER (digits roll up from below, no layout shift)
   ========================================================================= */

// Digits are drawn with CSS pseudo-content so the strips never appear in copied or crawled page text.
const DIGIT_ROWS = "01234567890123456789".split("");

/**
 * One digit column. The strip holds 0-9 twice so a 9 -> 0 wrap keeps rolling upward;
 * after that transition ends the strip snaps back to the first copy without animating.
 */
function OdometerDigit({ digit }: { digit: number }) {
  const [row, setRowState] = useState(digit);
  const [snap, setSnap] = useState(false);
  const rowRef = useRef(digit);
  const setRow = (r: number) => {
    rowRef.current = r;
    setRowState(r);
  };

  useEffect(() => {
    const cur = rowRef.current % 10;
    if (digit === cur) return;
    const delta = (digit - cur + 10) % 10; // always roll upward, wrapping 9 -> 0 through the second copy
    if (rowRef.current >= 10) {
      // A previous wrap has not snapped back yet (transitionend missed, e.g. background tab): normalise first.
      setSnap(true);
      setRow(cur);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setSnap(false);
          setRow(cur + delta);
        }),
      );
    } else {
      setSnap(false);
      setRow(rowRef.current + delta);
    }
  }, [digit]);

  return (
    <span className="relative inline-block h-[1.2em] w-[1ch] overflow-hidden align-top" aria-hidden="true">
      <span
        className="absolute inset-x-0 top-0 flex flex-col will-change-transform motion-reduce:!transition-none"
        style={{
          transform: `translateY(${-row * 1.2}em)`,
          transition: snap ? "none" : "transform 650ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        onTransitionEnd={() => {
          if (rowRef.current >= 10) {
            setSnap(true);
            setRow(rowRef.current - 10);
          }
        }}
      >
        {DIGIT_ROWS.map((d, i) => (
          <span
            key={i}
            data-d={d}
            className="block h-[1.2em] text-center leading-[1.2em] before:content-[attr(data-d)]"
          />
        ))}
      </span>
    </span>
  );
}

/** Formats `value` with thousands separators; digits are keyed by place so each column keeps its own state. */
export function Odometer({ value, suffix = "" }: { value: number; suffix?: string }) {
  const text = formatWithCommas(value);
  const chars = text.split("");
  const total = chars.length;
  return (
    <span
      dir="ltr"
      className="inline-flex h-[1.2em] items-start font-sans font-bold tabular-nums"
    >
      <span className="sr-only">{`${text}${suffix}`}</span>
      {chars.map((ch, i) => {
        const place = total - i; // stable key counted from the right
        return /\d/.test(ch) ? (
          <OdometerDigit key={place} digit={Number(ch)} />
        ) : (
          <span key={place} data-d={ch} className="inline-block h-[1.2em] leading-[1.2em] before:content-[attr(data-d)]" aria-hidden="true" />
        );
      })}
      {suffix ? <span data-d={suffix} className="leading-[1.2em] before:content-[attr(data-d)]" aria-hidden="true" /> : null}
    </span>
  );
}

/** Views to add for one tick at `velocityPerMinute` over `intervalMs`, with +/-50% organic jitter (always >= 1). */
export function organicIncrement(velocityPerMinute: number, intervalMs: number, rand: number = Math.random()): number {
  const expected = (velocityPerMinute / 60_000) * intervalMs;
  return Math.max(1, Math.round(expected * (0.5 + rand)));
}

const MAX_CATCH_UP_MS = 10 * 60_000;

function LiveTotalViewsCounter({ initialTotal, velocityPerMinute }: { initialTotal: number; velocityPerMinute: number }) {
  const [count, setCount] = useState(initialTotal);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let last = Date.now();

    const schedule = () => {
      const delay = 1800 + Math.random() * 2200;
      timeoutId = setTimeout(() => {
        const now = Date.now();
        setCount((prev) => prev + organicIncrement(velocityPerMinute, now - last));
        last = now;
        schedule();
      }, delay);
    };

    // Browsers throttle timers in background tabs; on return, credit the missed time (capped) instead of staying stale.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const missed = Math.min(Date.now() - last, MAX_CATCH_UP_MS);
      if (missed > 5000) {
        setCount((prev) => prev + organicIncrement(velocityPerMinute, missed, 0.5));
        last = Date.now();
      }
    };

    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [velocityPerMinute]);

  return (
    <span className="text-slate-900 dark:text-white">
      <Odometer value={count} suffix="+" />
    </span>
  );
}

/* =========================================================================
   1. SOCIAL METRICS BAR (Compact Hero Row)
   ========================================================================= */

export interface SocialMetricsBarProps {
  initialData?: SocialMetricsSnapshot;
  className?: string;
}

export function SocialMetricsBar({
  initialData = INITIAL_SOCIAL_METRICS,
  className = "",
}: SocialMetricsBarProps) {
  const { t } = useTranslation("landing");

  const totalViews =
    initialData.instagram.videoViews + initialData.facebook.videoViews;
  const totalFollowers =
    initialData.instagram.followers + initialData.facebook.followers;
  const totalEngagement =
    initialData.instagram.engagement + initialData.facebook.engagement;

  return (
    <div
      id="hero-social-metrics-bar"
      aria-label="MAE Academy Social Metrics"
      className={`flex flex-wrap items-center justify-between gap-y-3 gap-x-4 sm:gap-x-5 py-2.5 px-3.5 sm:px-5 rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white/80 dark:bg-[#08080A]/90 shadow-xs backdrop-blur-xs font-sans text-xs sm:text-sm ${className}`.trim()}
    >
      {/* 1. Total Views / Reach */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/15">
          <Eye className="h-3.5 w-3.5" />
        </span>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 dark:text-zinc-500">
            {t("socialMetrics.totalViews")}
          </span>
          <div className="text-xs sm:text-sm font-bold leading-none">
            <LiveTotalViewsCounter initialTotal={totalViews} velocityPerMinute={initialData.estimatedVelocityPerMinute} />
          </div>
        </div>
      </div>

      {/* Subtle Vertical Divider */}
      <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-white/10" aria-hidden="true" />

      {/* 2. Community / Followers */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/15">
          <Users className="h-3.5 w-3.5" />
        </span>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 dark:text-zinc-500">
            {t("socialMetrics.community")}
          </span>
          <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-none font-sans">
            <bdi dir="ltr">{formatCompact(totalFollowers)}</bdi>
          </div>
        </div>
      </div>

      {/* Subtle Vertical Divider */}
      <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-white/10" aria-hidden="true" />

      {/* 3. Total Reactions / Engagement */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/15">
          <Heart className="h-3.5 w-3.5" />
        </span>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 dark:text-zinc-500">
            {t("socialMetrics.reactions")}
          </span>
          <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-none font-sans">
            <bdi dir="ltr">{formatCompact(totalEngagement)}</bdi>
          </div>
        </div>
      </div>

      {/* Subtle Vertical Divider */}
      <div className="hidden lg:block h-6 w-px bg-slate-200 dark:bg-white/10" aria-hidden="true" />

      {/* 4. Official Handle Badge: @mae.academy */}
      <div className="flex items-center gap-1.5 ms-auto sm:ms-0">
        <a
          href="https://www.instagram.com/mae.academy/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Visit @mae.academy on Instagram"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100/90 dark:bg-white/5 hover:bg-slate-200/80 dark:hover:bg-white/10 border border-slate-200/80 dark:border-white/10 transition-colors"
        >
          <span className="flex items-center gap-1 text-slate-700 dark:text-zinc-300 font-medium text-xs">
            <InstagramIcon className="h-3 w-3 text-pink-600 dark:text-pink-400" />
            <FacebookIcon className="h-3 w-3 text-blue-600 dark:text-blue-400" />
            <bdi dir="ltr" className="font-semibold font-sans">@mae.academy</bdi>
          </span>
          <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 fill-blue-500/20" />
        </a>
      </div>
    </div>
  );
}

// Backwards compatibility alias
export const LiveSocialMetricsBanner = SocialMetricsBar;

/* =========================================================================
   2. SOCIAL PLATFORM BREAKDOWN CARDS (Bottom of Landing Page)
   ========================================================================= */

export interface SocialPlatformBreakdownProps {
  initialData?: SocialMetricsSnapshot;
  className?: string;
}

export function SocialPlatformBreakdown({
  initialData = INITIAL_SOCIAL_METRICS,
  className = "",
}: SocialPlatformBreakdownProps) {
  const { t } = useTranslation("landing");

  return (
    <section
      id="platform-metrics-breakdown"
      aria-label="Official Platform Reach Breakdown"
      className={`w-full py-8 sm:py-10 border-t border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#000000] font-sans ${className}`.trim()}
    >
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
        {/* Subtle section header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-600" />
            <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              {t("socialMetrics.officialTelemetry")}
            </h3>
          </div>
          <bdi dir="ltr" className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
            @mae.academy
          </bdi>
        </div>

        {/* 2-Column Grid: Instagram & Facebook */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* ========================================================= */}
          {/* INSTAGRAM CARD                                            */}
          {/* ========================================================= */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/80 p-5 sm:p-6 shadow-xs dark:border-white/[0.08] dark:bg-[#08080A]">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF]" />

            <div className="flex items-center justify-between pb-4 border-b border-slate-200/80 dark:border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white shadow-xs">
                  <InstagramIcon className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white">
                      Instagram
                    </h4>
                    <CheckCircle2 className="h-4 w-4 text-blue-500" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    <bdi dir="ltr">{initialData.instagram.handle}</bdi>
                  </p>
                </div>
              </div>

              <a
                href={initialData.instagram.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Visit MAE Academy on Instagram"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200/80 hover:bg-slate-100 hover:text-slate-900 transition-all dark:bg-white/5 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/10"
              >
                <span>{t("socialMetrics.visitProfile")}</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3 pt-4 text-left rtl:text-right">
              {/* Followers */}
              <div className="p-3 rounded-xl border border-slate-200/70 bg-white dark:border-white/[0.05] dark:bg-[#0d0f12]">
                <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 mb-0.5">
                  {t("socialMetrics.followers")}
                </div>
                <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-sans">
                  {formatWithCommas(initialData.instagram.followers)}
                </div>
              </div>

              {/* Video Views */}
              <div className="p-3 rounded-xl border border-slate-200/70 bg-white dark:border-white/[0.05] dark:bg-[#0d0f12]">
                <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 mb-0.5">
                  {t("socialMetrics.views")}
                </div>
                <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-sans">
                  <bdi dir="ltr">{formatCompact(initialData.instagram.videoViews)}</bdi>
                </div>
              </div>

              {/* Engagement */}
              <div className="p-3 rounded-xl border border-slate-200/70 bg-white dark:border-white/[0.05] dark:bg-[#0d0f12]">
                <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 mb-0.5">
                  {t("socialMetrics.reactions")}
                </div>
                <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-sans">
                  <bdi dir="ltr">{formatCompact(initialData.instagram.engagement)}</bdi>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* FACEBOOK CARD                                             */}
          {/* ========================================================= */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/80 p-5 sm:p-6 shadow-xs dark:border-white/[0.08] dark:bg-[#08080A]">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#1877F2] to-[#0C63D4]" />

            <div className="flex items-center justify-between pb-4 border-b border-slate-200/80 dark:border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1877F2] text-white shadow-xs">
                  <FacebookIcon className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white">
                      Facebook
                    </h4>
                    <CheckCircle2 className="h-4 w-4 text-blue-500" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    MAE Academy
                  </p>
                </div>
              </div>

              <a
                href={initialData.facebook.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Visit MAE Academy on Facebook"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200/80 hover:bg-slate-100 hover:text-slate-900 transition-all dark:bg-white/5 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/10"
              >
                <span>{t("socialMetrics.visitPage")}</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3 pt-4 text-left rtl:text-right">
              {/* Followers */}
              <div className="p-3 rounded-xl border border-slate-200/70 bg-white dark:border-white/[0.05] dark:bg-[#0d0f12]">
                <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 mb-0.5">
                  {t("socialMetrics.followers")}
                </div>
                <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-sans">
                  {formatWithCommas(initialData.facebook.followers)}
                </div>
              </div>

              {/* Video Views */}
              <div className="p-3 rounded-xl border border-slate-200/70 bg-white dark:border-white/[0.05] dark:bg-[#0d0f12]">
                <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 mb-0.5">
                  {t("socialMetrics.views")}
                </div>
                <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-sans">
                  <bdi dir="ltr">{formatCompact(initialData.facebook.videoViews)}</bdi>
                </div>
              </div>

              {/* Engagement */}
              <div className="p-3 rounded-xl border border-slate-200/70 bg-white dark:border-white/[0.05] dark:bg-[#0d0f12]">
                <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 mb-0.5">
                  {t("socialMetrics.engagement")}
                </div>
                <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-sans">
                  <bdi dir="ltr">{formatCompact(initialData.facebook.engagement)}</bdi>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default SocialMetricsBar;

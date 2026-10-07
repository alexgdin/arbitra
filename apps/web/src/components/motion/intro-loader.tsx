"use client";

import { cn } from "@my-better-t-app/ui/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { BRAND } from "@/lib/brand";

import { introIsPending, markIntroDone } from "./intro";

/** Counter run time; with the short hold the overlay starts lifting after about 1.4 s. */
const COUNT_MS = 1200;
const HOLD_MS = 200;
/** Curtain exit: the dark panel lifts first, the emerald brand panel follows. */
const LEAVE_MS = 1000;
const EASE = "ease-[cubic-bezier(0.76,0,0.24,1)]";

type Phase = "off" | "counting" | "leaving";

/**
 * First-visit intro: wordmark and a 0-100% counter over a dark stage, then a two-panel curtain
 * (dark, then solid emerald) lifts away. Decided in an effect, so the server render is the
 * page itself; skipped with reduced motion; click or Escape skips it. The overlay is
 * aria-hidden and the page stays in the DOM underneath, so assistive tech is never blocked.
 */
export function IntroLoader() {
  const [phase, setPhase] = useState<Phase>("off");
  const [progress, setProgress] = useState(0);
  const skipRef = useRef<() => void>(() => undefined);
  const skip = useCallback(() => skipRef.current(), []);

  useEffect(() => {
    if (!introIsPending()) {
      return;
    }
    setPhase("counting");
    setProgress(0);

    let raf = 0;
    let holdTimer = 0;
    let endTimer = 0;
    let finished = false;
    const startedAt = performance.now();

    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(holdTimer);
      setProgress(100);
      setPhase("leaving");
      markIntroDone();
      endTimer = window.setTimeout(() => setPhase("off"), LEAVE_MS + 200);
    };
    skipRef.current = finish;

    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / COUNT_MS);
      const eased = 1 - (1 - t) ** 3;
      setProgress(Math.round(eased * 100));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        holdTimer = window.setTimeout(finish, HOLD_MS);
      }
    };
    raf = requestAnimationFrame(tick);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        finish();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(holdTimer);
      window.clearTimeout(endTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (phase === "off") {
    return null;
  }

  const leaving = phase === "leaving";
  const wordmark = BRAND.name.toUpperCase();

  return (
    <div
      aria-hidden="true"
      className={cn(
        "dark fixed inset-0 z-[100] select-none",
        leaving && "pointer-events-none",
      )}
      onClick={skip}
    >
      {/* solid brand panel, revealed for a beat as the dark panel lifts */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center bg-[oklch(0.7_0.15_165)] transition-transform delay-200 duration-1000",
          EASE,
          leaving && "-translate-y-full",
        )}
      >
        <span className="mr-[-0.6em] font-semibold text-2xl text-[oklch(0.18_0.04_166)] uppercase tracking-[0.6em] sm:text-4xl">
          {wordmark}
        </span>
      </div>

      <div
        className={cn(
          "arbitra-stage absolute inset-0 flex flex-col overflow-hidden text-foreground transition-transform duration-1000",
          EASE,
          leaving && "-translate-y-full",
        )}
      >
        <div className="pointer-events-none absolute top-1/2 left-1/2 size-[80vmax] -translate-x-1/2 -translate-y-1/2 animate-[arbitra-float_10s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,oklch(0.74_0.16_164/0.22),transparent)] motion-reduce:animate-none" />

        <div className="relative flex items-center justify-between px-5 pt-5 font-mono text-[0.62rem] text-muted-foreground uppercase tracking-[0.35em] sm:px-8 sm:pt-8">
          <span>Comparator de prețuri</span>
          <span className="max-sm:hidden">eMAG · PC Garage · Altex</span>
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center gap-6 sm:gap-8">
          <BrandLogo
            alt=""
            className="animate-[arbitra-pop_0.8s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none"
            size={72}
          />
          <span className="mr-[-0.6em] font-light text-3xl uppercase tracking-[0.6em] sm:text-5xl">
            {wordmark}
          </span>
        </div>

        <div className="relative space-y-4 px-5 pb-6 sm:px-8 sm:pb-8">
          <div className="flex items-end justify-between gap-4">
            <span className="font-mono text-[0.62rem] text-muted-foreground uppercase tracking-[0.35em]">
              Apasă oriunde sau Esc pentru a sări
            </span>
            <span className="font-light font-mono text-5xl tabular-nums leading-none sm:text-7xl">
              {progress}
              <span className="text-primary">%</span>
            </span>
          </div>
          <div className="h-px w-full overflow-hidden bg-white/10">
            <div
              className="h-full w-full origin-left bg-primary"
              style={{ transform: `scaleX(${progress / 100})` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

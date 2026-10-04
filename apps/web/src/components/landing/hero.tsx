import { Badge } from "@my-better-t-app/ui/components/badge";
import { buttonVariants } from "@my-better-t-app/ui/components/button";
import { Sparkles } from "lucide-react";
import Link from "next/link";

import { BRAND } from "@/lib/brand";
import { getStore, STORE_IDS } from "@/lib/stores";

import { PricePreview } from "./price-preview";
import { StartLink } from "./start-link";

const GLOW =
  "radial-gradient(50% 60% at 82% 0%, color-mix(in oklch, var(--primary) 16%, transparent), transparent), radial-gradient(40% 50% at 0% 35%, color-mix(in oklch, var(--warning) 10%, transparent), transparent)";
const GRID =
  "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)";
const GRID_MASK = "radial-gradient(70% 70% at 50% 30%, black, transparent)";

const HEADLINE_PARTS = BRAND.tagline.split(/(?<=\.)\s+/);

function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0" style={{ backgroundImage: GLOW }} />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: GRID,
          backgroundSize: "3rem 3rem",
          maskImage: GRID_MASK,
          WebkitMaskImage: GRID_MASK,
        }}
      />
    </div>
  );
}

function TrustStrip() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6 sm:pb-16">
      <div className="flex flex-col items-center gap-4 border-t pt-8 sm:flex-row sm:justify-center sm:gap-6">
        <p className="text-muted-foreground text-sm">Urmărim prețurile din magazinele mari</p>
        <ul className="flex flex-wrap items-center justify-center gap-2">
          {STORE_IDS.map((id) => {
            const { name, colorVar } = getStore(id);
            return (
              <li
                key={id}
                className="inline-flex h-9 items-center gap-2 rounded-full border bg-card px-4 font-medium text-sm shadow-xs"
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: colorVar }}
                />
                {name}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      <HeroBackdrop />
      <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pt-12 pb-16 sm:px-6 sm:pt-20 sm:pb-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div className="max-w-xl">
          <Badge variant="success" className="h-7 px-3">
            <Sparkles aria-hidden="true" />
            Cumpărături inteligente în România
          </Badge>
          <h1
            id="hero-title"
            className="mt-5 font-semibold text-4xl leading-[1.1] tracking-tight sm:text-5xl"
          >
            {HEADLINE_PARTS.map((part, index) => (
              <span key={part} className={index === 0 ? "block" : "block text-primary"}>
                {part}
              </span>
            ))}
          </h1>
          <p className="mt-5 max-w-lg text-pretty text-base text-muted-foreground sm:text-lg">
            Urmărim prețurile din eMAG, PC Garage și Altex și cumpărăm pentru tine când produsul
            ajunge la prețul dorit. Dacă prețul scade în 14 zile, te ajutăm să recuperezi diferența.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <StartLink />
            <Link
              href="#cum-functioneaza"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              Vezi cum funcționează
            </Link>
          </div>
        </div>
        <PricePreview />
      </div>
      <TrustStrip />
    </section>
  );
}

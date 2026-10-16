import { Wrench } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { HeroBackdrop } from "@/components/landing/hero-backdrop";
import { TerminalLink } from "@/components/landing/terminal-link";
import { Reveal } from "@/components/motion/reveal";
import { ScrambleText } from "@/components/motion/scramble-text";
import { BRAND } from "@/lib/brand";

export default function MainenanceScreen() {
  return (
    <main
      aria-labelledby="maintenance-title"
      className="arbitra-stage dark relative isolate flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 py-16 text-center text-foreground sm:px-6"
    >
      <HeroBackdrop />

      <Reveal className="flex flex-col items-center">
        <BrandLogo alt="" size={56} />
        <span className="mt-4 font-semibold text-[0.8rem] uppercase tracking-[0.42em]">
          {BRAND.name}
        </span>
      </Reveal>

      <Reveal className="mt-12" delay={150}>
        <p className="flex items-center justify-center gap-3 font-mono text-[0.62rem] text-primary uppercase tracking-[0.4em] sm:text-[0.68rem]">
          <span aria-hidden="true" className="h-px w-6 bg-primary/60 sm:w-10" />
          <Wrench aria-hidden="true" className="size-3.5" />
          Mentenanță
          <span aria-hidden="true" className="h-px w-6 bg-primary/60 sm:w-10" />
        </p>
      </Reveal>

      <h1
        className="mt-8 max-w-3xl font-semibold text-[clamp(1.75rem,5vw,3.5rem)] uppercase leading-[1.08] tracking-[0.08em]"
        id="maintenance-title"
      >
        <ScrambleText className="block" text="Site-ul este în mentenanță" />
      </h1>

      <Reveal className="mt-8 max-w-xl" delay={350}>
        <p className="text-pretty text-[0.7rem] text-muted-foreground uppercase leading-loose tracking-[0.26em] sm:text-xs">
          Ne cerem scuze pentru așteptare. Lucrăm la îmbunătățiri și revenim în
          cel mai scurt timp.
        </p>
      </Reveal>

      <Reveal className="mt-10 flex flex-col items-center gap-6" delay={550}>
        <p
          className="flex items-center gap-3 font-mono text-[0.62rem] text-muted-foreground uppercase tracking-[0.3em]"
          role="status"
        >
          <span aria-hidden="true" className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          Revenim în curând
        </p>

        <TerminalLink href="/login" label="Acces administrator" variant="ghost" />
      </Reveal>
    </main>
  );
}
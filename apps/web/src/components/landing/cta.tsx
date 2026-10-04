import { StartLink } from "./start-link";

const GLOW =
  "radial-gradient(60% 80% at 100% 0%, color-mix(in oklch, var(--primary) 22%, transparent), transparent), radial-gradient(40% 60% at 0% 100%, color-mix(in oklch, var(--warning) 14%, transparent), transparent)";

export function Cta() {
  return (
    <section aria-labelledby="cta-title" className="px-4 py-16 sm:px-6 sm:py-24">
      <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-2xl border border-primary/20 bg-accent px-6 py-12 text-center sm:px-12 sm:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ backgroundImage: GLOW }}
        />
        <h2
          id="cta-title"
          className="mx-auto max-w-2xl font-semibold text-3xl text-accent-foreground tracking-tight sm:text-4xl"
        >
          Începe să plătești mai puțin
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-balance text-accent-foreground text-base">
          Creează-ți un cont gratuit și adaugă primul produs în coș. Noi urmărim prețul pentru tine.
        </p>
        <div className="mt-8 flex justify-center">
          <StartLink />
        </div>
      </div>
    </section>
  );
}

import { SectionHeading } from "./section-heading";

const STEPS = [
  {
    title: "Adaugi produsul",
    description:
      "Alegi produsul dorit din eMAG, PC Garage sau Altex și îl adaugi în coșul tău.",
  },
  {
    title: "Îți alegi prețul",
    description:
      "Setezi prețul țintă și, dacă vrei, activezi cumpărarea automată cu o limită stabilită de tine.",
  },
  {
    title: "Noi facem restul",
    description:
      "Urmărim prețul, cumpărăm când ajunge la țintă și te protejăm dacă scade în 14 zile.",
  },
] as const;

export function HowItWorks() {
  return (
    <section
      id="cum-functioneaza"
      aria-labelledby="how-title"
      className="border-y bg-muted/40 px-4 py-16 sm:px-6 sm:py-24"
    >
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          id="how-title"
          eyebrow="Cum funcționează"
          title="Trei pași și ești pe drumul cel bun"
          description="Fără tab-uri deschise și fără să verifici prețurile zi de zi."
        />
        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map(({ title, description }, index) => (
            <li key={title}>
              <div className="flex items-center gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-base text-primary-foreground shadow-sm"
                >
                  {index + 1}
                </span>
                {index < STEPS.length - 1 ? (
                  <span aria-hidden="true" className="hidden h-px flex-1 bg-border md:block" />
                ) : null}
              </div>
              <h3 className="mt-5 font-semibold text-lg tracking-tight">
                <span className="sr-only">{`Pasul ${index + 1}: `}</span>
                {title}
              </h3>
              <p className="mt-2 text-pretty text-muted-foreground text-sm/relaxed">
                {description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

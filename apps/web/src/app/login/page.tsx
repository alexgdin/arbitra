import { Bot, ChartLine, type LucideIcon, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { BRAND } from "@/lib/brand";

import AuthPanel from "./auth-panel";

export const metadata: Metadata = {
  title: "Conectare",
};

const PERKS: readonly { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: ChartLine,
    title: "Istoric de prețuri",
    description: "Vezi cum a evoluat prețul și afli dacă oferta chiar merită.",
  },
  {
    icon: Bot,
    title: "Broker automat",
    description: "Cumpărăm pentru tine când produsul ajunge la prețul tău.",
  },
  {
    icon: ShieldCheck,
    title: "Protecția prețului",
    description: "Poți cere rambursarea diferenței dacă prețul scade în 14 zile.",
  },
];

const TAGLINE_PARTS = BRAND.tagline.split(/(?<=\.)\s+/);

const BACKDROP =
  "radial-gradient(45% 55% at 85% 0%, color-mix(in oklch, var(--primary) 14%, transparent), transparent), radial-gradient(40% 50% at 0% 100%, color-mix(in oklch, var(--warning) 9%, transparent), transparent)";

export default function LoginPage() {
  return (
    <div className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ backgroundImage: BACKDROP }}
      />
      <div className="mx-auto grid w-full max-w-5xl items-center gap-12 px-4 py-10 sm:px-6 sm:py-16 lg:grid-cols-2 lg:gap-20 lg:py-24">
        <aside aria-label={`De ce ${BRAND.name}`} className="hidden lg:block">
          <p className="font-semibold text-4xl leading-tight tracking-tight">
            {TAGLINE_PARTS.map((part, index) => (
              <span key={part} className={index === 0 ? "block" : "block text-primary"}>
                {part}
              </span>
            ))}
          </p>
          <p className="mt-4 max-w-md text-base text-muted-foreground">
            Un singur cont pentru prețurile din eMAG, PC Garage și Altex.
          </p>
          <ul className="mt-8 grid gap-5">
            {PERKS.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex items-start gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <p className="font-medium text-base">{title}</p>
                  <p className="text-muted-foreground text-sm">{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>
        <div className="mx-auto w-full max-w-md">
          <AuthPanel />
        </div>
      </div>
    </div>
  );
}

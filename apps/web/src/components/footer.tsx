import Link from "next/link";

import { BRAND } from "@/lib/brand";

const LINKS = [
  { href: "/", label: "Prezentare" },
  { href: "/dashboard", label: "Panou" },
  { href: "/dashboard/cart", label: "Coș și optimizare" },
  { href: "/dashboard/broker", label: "Broker automat" },
] as const;

export default function Footer() {
  return (
    <footer className="border-t bg-card">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 md:flex-row md:justify-between">
        <div className="max-w-sm space-y-2">
          <p className="font-semibold text-base tracking-tight">{BRAND.name}</p>
          <p className="text-pretty text-muted-foreground text-sm">
            {BRAND.tagline} Urmărim prețurile din eMAG, PC Garage și Altex, ca tu să cumperi exact
            când merită.
          </p>
        </div>
        <nav aria-label="Linkuri utile">
          <ul className="flex flex-col gap-1 sm:flex-row sm:gap-6">
            {LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="inline-flex min-h-10 items-center rounded-lg text-muted-foreground text-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t">
        <p className="mx-auto w-full max-w-6xl text-pretty px-4 py-4 text-muted-foreground text-xs sm:px-6">
          © {new Date().getFullYear()} {BRAND.name}. Prețurile sunt preluate periodic din magazinele
          online monitorizate și pot diferi de cele afișate pe site-ul comerciantului.
        </p>
      </div>
    </footer>
  );
}

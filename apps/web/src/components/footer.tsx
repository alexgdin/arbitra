import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { CookieSettingsButton } from "@/components/cookie-consent";
import { BRAND } from "@/lib/brand";

const LINK_CLASS =
  "inline-flex min-h-9 items-center gap-1 rounded-md text-left text-muted-foreground text-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

const APP_LINKS = [
  { href: "/", label: "Prima pagină" },
  { href: "/cauta", label: "Caută produse" },
  { href: "/dashboard", label: "Panoul meu" },
] as const;

const LEGAL_LINKS = [
  { href: "/termeni", label: "Termeni și condiții" },
  { href: "/confidentialitate", label: "Confidențialitate" },
  { href: "/cookies", label: "Politica de cookie-uri" },
] as const;

const EXTERNAL_LINKS = [
  { href: "https://www.emag.ro/", label: "eMAG" },
  { href: "https://www.pcgarage.ro/", label: "PC Garage" },
  { href: "https://altex.ro/", label: "Altex" },
  { href: "https://github.com/alexgdin/arbitra", label: "Codul sursă pe GitHub" },
] as const;

function FooterHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-2 font-medium text-foreground text-sm">
      {children}
    </h2>
  );
}

export default function Footer() {
  return (
    <footer className="border-t bg-card">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div className="max-w-sm space-y-2">
          <p className="font-semibold text-base tracking-tight">{BRAND.name}</p>
          <p className="text-pretty text-muted-foreground text-sm">
            {BRAND.tagline} Comparăm prețurile din eMAG, PC Garage și Altex și te anunțăm în
            aplicație când prețul ajunge la ținta ta.
          </p>
        </div>

        <nav aria-labelledby="footer-app">
          <FooterHeading id="footer-app">Aplicația</FooterHeading>
          <ul className="grid gap-0.5">
            {APP_LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link href={href} className={LINK_CLASS}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-legal">
          <FooterHeading id="footer-legal">Informații legale</FooterHeading>
          <ul className="grid gap-0.5">
            {LEGAL_LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link href={href} className={LINK_CLASS}>
                  {label}
                </Link>
              </li>
            ))}
            <li>
              <CookieSettingsButton className={`${LINK_CLASS} cursor-pointer`} />
            </li>
          </ul>
        </nav>

        <nav aria-labelledby="footer-external">
          <FooterHeading id="footer-external">Magazine și proiect</FooterHeading>
          <ul className="grid gap-0.5">
            {EXTERNAL_LINKS.map(({ href, label }) => (
              <li key={href}>
                <a href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                  {label}
                  <ArrowUpRight aria-hidden="true" className="size-3.5" />
                  <span className="sr-only"> (se deschide într-o filă nouă)</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-4 text-muted-foreground text-xs sm:flex-row sm:justify-between sm:gap-6 sm:px-6">
          <p>© 2026 {BRAND.name} · Prototip realizat la hackathon</p>
          <p className="text-pretty sm:text-right">
            Prețurile sunt informative și pot diferi de cele de pe site-ul magazinului. Nu suntem
            afiliați cu eMAG, PC Garage sau Altex.
          </p>
        </div>
      </div>
    </footer>
  );
}

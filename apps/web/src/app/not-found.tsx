import { buttonVariants } from "@my-better-t-app/ui/components/button";
import { House, LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pagina nu a fost găsită",
};

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-28">
      <p
        aria-hidden="true"
        className="font-semibold text-7xl text-primary/25 tabular-nums tracking-tight sm:text-8xl"
      >
        404
      </p>
      <h1 className="mt-4 font-semibold text-2xl tracking-tight sm:text-3xl">
        Pagina nu a fost găsită
      </h1>
      <p className="mt-3 max-w-md text-pretty text-base text-muted-foreground">
        Adresa nu există sau pagina a fost mutată. Te putem duce înapoi la prima pagină sau la
        panoul tău.
      </p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Link href="/" className={buttonVariants({ size: "lg" })}>
          <House aria-hidden="true" />
          Înapoi acasă
        </Link>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline", size: "lg" })}>
          <LayoutDashboard aria-hidden="true" />
          Mergi la panou
        </Link>
      </div>
    </div>
  );
}

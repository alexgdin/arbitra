"use client";

import { Button, buttonVariants } from "@my-better-t-app/ui/components/button";
import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div
      role="alert"
      className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-28"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-warning/15 text-warning-foreground">
        <TriangleAlert aria-hidden="true" className="size-7" />
      </span>
      <h1 className="mt-6 font-semibold text-2xl tracking-tight sm:text-3xl">
        Ceva nu a mers bine
      </h1>
      <p className="mt-3 max-w-md text-pretty text-base text-muted-foreground">
        Am întâmpinat o problemă neașteptată. Încearcă din nou, iar dacă problema persistă, revino
        în câteva minute.
      </p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Button size="lg" onClick={() => retry()}>
          <RotateCcw aria-hidden="true" />
          Încearcă din nou
        </Button>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Înapoi acasă
        </Link>
      </div>
      {error.digest ? (
        <p className="mt-6 text-muted-foreground text-xs">
          Cod eroare: <span className="font-mono">{error.digest}</span>
        </p>
      ) : null}
    </div>
  );
}

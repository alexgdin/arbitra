"use client";

import { buttonVariants } from "@my-better-t-app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@my-better-t-app/ui/components/card";
import { Skeleton } from "@my-better-t-app/ui/components/skeleton";
import { Bot, ChartLine, type LucideIcon, Target } from "lucide-react";
import Link from "next/link";

import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth-client";

import type { CatalogItem } from "./types";
import { WatchForm } from "./watch-form";

const TITLE_ID = "urmareste-pretul";

const BENEFITS: readonly { icon: LucideIcon; text: string }[] = [
  { icon: Target, text: "Îți setezi prețul la care vrei să cumperi." },
  { icon: Bot, text: "Brokerul automat cumpără când prețul ajunge la țintă." },
  { icon: ChartLine, text: "Toate produsele urmărite sunt într-un singur panou." },
];

function WatchCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className} aria-busy="true">
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
      <span role="status" className="sr-only">
        Se verifică dacă ești conectat…
      </span>
    </Card>
  );
}

function SignedOutCard({ className }: { className?: string }) {
  return (
    <Card className={className} role="region" aria-labelledby={TITLE_ID}>
      <CardHeader>
        <h2 id={TITLE_ID} className="font-semibold text-lg">
          Urmărește prețul gratuit
        </h2>
        <CardDescription>
          Cu un cont gratuit urmărești prețul acestui produs, îți setezi o țintă și lași brokerul
          automat să cumpere în locul tău.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2.5">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon aria-hidden="true" className="size-4" />
              </span>
              <span className="pt-1">{text}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/login" className={buttonVariants({ className: "flex-1" })}>
            Creează cont
          </Link>
          <Link href="/login" className={buttonVariants({ variant: "outline", className: "flex-1" })}>
            Conectare
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

/** Sign-up call to action for visitors, the target form for signed-in users. */
export function WatchCard({ item, className }: { item: CatalogItem; className?: string }) {
  const hydrated = useHydrated();
  const { data: session, isPending } = authClient.useSession();

  if (!hydrated || isPending) {
    return <WatchCardSkeleton className={className} />;
  }
  if (session) {
    return <WatchForm item={item} className={className} />;
  }
  return <SignedOutCard className={className} />;
}

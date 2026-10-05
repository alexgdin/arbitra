"use client";

import { buttonVariants } from "@my-better-t-app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@my-better-t-app/ui/components/table";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Target } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { ENTER } from "@/components/dashboard/enter-animation";
import { trpc } from "@/utils/trpc";

import { QueryError, TargetsSkeleton } from "./broker-states";
import { RemoveTargetButton } from "./target-actions";
import { CurrentPrice, TargetPrice, TargetTitle } from "./target-parts";
import type { BrokerTarget } from "./types";

function formatReachedCount(count: number): string {
  return count === 1
    ? "Un produs a ajuns la prețul țintă."
    : `${count} produse au ajuns la prețul țintă.`;
}

export function TargetsTable({ className }: { className?: string }) {
  const query = useQuery(trpc.broker.listTargets.queryOptions());
  const targets = (query.data ?? [])
    .flatMap((row): BrokerTarget[] =>
      row.targetPrice === null ? [] : [{ ...row, targetPrice: row.targetPrice }],
    )
    // produsele care și-au atins ținta apar primele, restul își păstrează ordinea
    .sort((a, b) => Number(b.targetReached) - Number(a.targetReached));
  const reachedCount = targets.filter((target) => target.targetReached).length;

  return (
    <Card className={cn("@container", className)}>
      <CardHeader>
        <CardTitle>Produse cu preț țintă</CardTitle>
        <CardDescription>
          Te anunțăm aici când prețul unui produs ajunge la ținta ta sau scade sub ea.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div aria-live="polite" className="empty:hidden">
          {reachedCount > 0 ? (
            <p
              className={cn(
                "mb-4 flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm",
                ENTER,
              )}
            >
              <BellRing aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
              <span>
                <span className="font-medium">{formatReachedCount(reachedCount)}</span>{" "}
                <span className="text-muted-foreground">E un moment bun să cumperi.</span>
              </span>
            </p>
          ) : null}
        </div>
        {query.data ? (
          <TargetsList targets={targets} />
        ) : (
          <TargetsPlaceholder
            failed={query.isError}
            onRetry={() => query.refetch()}
            retrying={query.isFetching}
          />
        )}
      </CardContent>
    </Card>
  );
}

function TargetsPlaceholder({
  failed,
  onRetry,
  retrying,
}: {
  failed: boolean;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (!failed) {
    return <TargetsSkeleton />;
  }
  return (
    <QueryError title="Nu am putut încărca produsele" onRetry={onRetry} retrying={retrying} />
  );
}

function TargetsList({ targets }: { targets: BrokerTarget[] }) {
  if (targets.length === 0) {
    return (
      <EmptyState
        icon={<Target />}
        title="Nu ai încă produse cu preț țintă"
        description="Alege un produs și setează prețul țintă. Noi urmărim prețul și te anunțăm când ajunge la el."
        action={
          <Link href="/dashboard" className={buttonVariants()}>
            Setează o țintă
          </Link>
        }
      />
    );
  }

  return (
    <>
      <ul className="@xl:hidden space-y-3">
        {targets.map((target, index) => (
          <TargetCard key={target.productId} target={target} index={index} />
        ))}
      </ul>
      <div className="-mx-3 @xl:block hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Produs</TableHead>
              <TableHead>Preț curent</TableHead>
              <TableHead>Preț țintă</TableHead>
              <TableHead className="w-14">
                <span className="sr-only">Acțiuni</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {targets.map((target) => (
              <TableRow key={target.productId}>
                <TableCell className="w-full min-w-40 max-w-0">
                  <TargetTitle target={target} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <CurrentPrice target={target} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <TargetPrice target={target} />
                </TableCell>
                <TableCell className="text-right">
                  <RemoveTargetButton target={target} iconOnly />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

/** Staggers the first cards a little; later ones enter together so long lists stay quick. */
const CARD_DELAYS = [
  undefined,
  "motion-safe:[--tw-animation-delay:60ms]",
  "motion-safe:[--tw-animation-delay:120ms]",
  "motion-safe:[--tw-animation-delay:180ms]",
] as const;

function TargetCard({ target, index }: { target: BrokerTarget; index: number }) {
  return (
    <li
      className={cn(
        "space-y-3 rounded-xl border bg-card p-4",
        target.targetReached && "border-success/30 bg-success/5",
        ENTER,
        CARD_DELAYS[Math.min(index, CARD_DELAYS.length - 1)],
      )}
    >
      <TargetTitle target={target} />
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="space-y-0.5">
          <dt className="text-muted-foreground text-xs">Preț curent</dt>
          <dd>
            <CurrentPrice target={target} />
          </dd>
        </div>
        <div className="space-y-0.5">
          <dt className="text-muted-foreground text-xs">Preț țintă</dt>
          <dd>
            <TargetPrice target={target} />
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 border-t pt-3">
        <RemoveTargetButton target={target} />
      </div>
    </li>
  );
}

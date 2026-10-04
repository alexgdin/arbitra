"use client";

import { buttonVariants } from "@my-better-t-app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card";
import { Label } from "@my-better-t-app/ui/components/label";
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
import { Target } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { trpc } from "@/utils/trpc";

import { QueryError, TargetsSkeleton } from "./broker-states";
import { AutoBuySwitch, RemoveTargetButton } from "./target-actions";
import { CurrentPrice, TargetPrice, TargetTitle } from "./target-parts";
import type { BrokerTarget } from "./types";

export function TargetsTable() {
  const query = useQuery(trpc.broker.listTargets.queryOptions());
  const targets = (query.data ?? []).flatMap((row): BrokerTarget[] =>
    row.targetPrice === null ? [] : [{ ...row, targetPrice: row.targetPrice }],
  );

  return (
    <Card className="@container">
      <CardHeader>
        <CardTitle>Produse cu preț țintă</CardTitle>
        <CardDescription>
          Brokerul cumpără doar produsele la care ai activat cumpărarea automată.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
        description="Alege un produs și setează prețul la care vrei să îl cumperi. Noi îl urmărim în locul tău."
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
        {targets.map((target) => (
          <TargetCard key={target.productId} target={target} />
        ))}
      </ul>
      <div className="-mx-3 @xl:block hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Produs</TableHead>
              <TableHead>Preț curent</TableHead>
              <TableHead>Preț țintă</TableHead>
              <TableHead className="w-24 whitespace-normal leading-tight">
                Cumpărare automată
              </TableHead>
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
                <TableCell>
                  <AutoBuySwitch target={target} />
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

function TargetCard({ target }: { target: BrokerTarget }) {
  return (
    <li
      className={cn(
        "space-y-3 rounded-xl border bg-card p-4",
        target.targetReached && "border-success/30 bg-success/5",
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
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t pt-3">
        <Label className="min-h-10 gap-2.5 font-normal">
          <AutoBuySwitch target={target} />
          <span>
            Cumpărare automată
            <span className="sr-only"> pentru {target.title}</span>
          </span>
        </Label>
        <RemoveTargetButton target={target} />
      </div>
    </li>
  );
}

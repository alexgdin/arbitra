"use client";

import { Button } from "@my-better-t-app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card";
import { Label } from "@my-better-t-app/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@my-better-t-app/ui/components/native-select";
import { Skeleton } from "@my-better-t-app/ui/components/skeleton";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FlaskConical, TrendingDown } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth-client";
import { formatBani } from "@/lib/format";
import { queryClient, trpc } from "@/utils/trpc";

interface DemoDropCardProps {
  className?: string;
}

/**
 * Development-only helper for the live demo: drops the price of a tracked demo product under its
 * target, so the "Preț țintă atins" notification appears. Renders nothing in production builds.
 */
export function DemoDropCard({ className }: DemoDropCardProps) {
  if (process.env.NODE_ENV === "production") {
    return null;
  }
  return <DemoDropCardContent className={className} />;
}

function DemoDropCardContent({ className }: DemoDropCardProps) {
  const selectId = useId();
  const hydrated = useHydrated();
  const { data: session } = authClient.useSession();
  const signedIn = hydrated && Boolean(session);

  const products = useQuery(
    trpc.demo.trackedDemoProducts.queryOptions(undefined, { enabled: signedIn }),
  );
  const [selected, setSelected] = useState("");

  const simulate = useMutation(
    trpc.demo.simulateDrop.mutationOptions({
      onSuccess: () => {
        toast.success("Prețul a scăzut. Notificarea apare în câteva secunde.");
        // alerts.reached, cart.list, catalog și product.history citesc toate prețul schimbat
        return queryClient.invalidateQueries();
      },
      onError: (error) => {
        toast.error(
          error.data?.code === "UNAUTHORIZED"
            ? "Sesiunea a expirat. Autentifică-te din nou."
            : "Nu am putut simula scăderea prețului. Încearcă din nou.",
        );
      },
    }),
  );

  if (!signedIn) {
    return null;
  }

  const items = products.data ?? [];
  // selecția rămâne validă după ce lista se reîncarcă (produsul simulat dispare din ea)
  const selectedId = items.some((item) => item.productId === selected)
    ? selected
    : (items[0]?.productId ?? "");

  return (
    <Card size="sm" className={cn("border-dashed", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical aria-hidden="true" className="size-4 text-muted-foreground" />
          Mod demo
        </CardTitle>
        <CardDescription>
          Simulează o scădere de preț pe un produs demo, ca notificarea să apară live.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {products.isPending ? (
          <Skeleton className="h-9 w-full" />
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Niciun produs demo cu țintă neatinsă. Setează o țintă peste prețul actual pe un produs
            demo ca să poți simula scăderea.
          </p>
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (selectedId) {
                simulate.mutate({ productId: selectedId });
              }
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor={selectId}>Produs demo</Label>
              <NativeSelect
                id={selectId}
                value={selectedId}
                onChange={(event) => setSelected(event.target.value)}
                disabled={simulate.isPending}
              >
                {items.map((item) => (
                  <NativeSelectOption key={item.productId} value={item.productId}>
                    {`${item.title} · acum ${formatBani(item.currentPrice)}, ținta ${formatBani(item.targetPrice)}`}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <Button type="submit" disabled={!selectedId || simulate.isPending}>
              <TrendingDown aria-hidden="true" />
              {simulate.isPending ? "Se simulează…" : "Simulează scăderea prețului"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default DemoDropCard;

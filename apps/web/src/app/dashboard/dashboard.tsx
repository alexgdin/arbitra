"use client";

import { Button } from "@my-better-t-app/ui/components/button";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { AddProductForm, focusAddProductForm } from "@/components/dashboard/add-product-form";
import { ENTER, ENTER_DELAY } from "@/components/dashboard/enter-animation";
import { OverviewStats } from "@/components/dashboard/overview-stats";
import {
  DETAIL_PANEL_ID,
  ProductDetail,
  ProductDetailSkeleton,
} from "@/components/dashboard/product-detail";
import { Watchlist } from "@/components/dashboard/watchlist";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

/** Tailwind `lg`: below this width the detail panel sits under the list, out of sight. */
const DESKTOP_QUERY = "(min-width: 1024px)";
const WHITESPACE = /\s+/;

function revealDetail() {
  document.getElementById(DETAIL_PANEL_ID)?.scrollIntoView({ block: "start" });
}

export default function Dashboard() {
  const { data: session } = authClient.useSession();
  const hydrated = useHydrated();
  const cart = useQuery(trpc.cart.list.queryOptions());
  const [selectedId, setSelectedId] = useState<string>();

  const items = cart.data?.items ?? [];
  const selected = items.find((item) => item.productId === selectedId) ?? items[0];
  const failed = cart.isError && !cart.data;
  const isEmpty = !cart.isPending && items.length === 0;
  // sesiunea poate fi deja în cache la hidratare, dar serverul n-o are: așteptăm hidratarea
  const firstName = hydrated ? session?.user.name.trim().split(WHITESPACE)[0] : undefined;

  function handleSelect(productId: string) {
    setSelectedId(productId);
    if (!window.matchMedia(DESKTOP_QUERY).matches) {
      revealDetail();
    }
  }

  function handleAdded(productId: string) {
    setSelectedId(productId);
    revealDetail();
  }

  return (
    <>
      <PageHeader
        className={ENTER}
        title={firstName ? `Bună, ${firstName}!` : "Bună!"}
        description="Urmărește prețurile produselor tale și setează o țintă. Te anunțăm în aplicație când prețul ajunge la ea sau scade sub ea."
        actions={
          <Button onClick={focusAddProductForm}>
            <Plus aria-hidden="true" data-icon="inline-start" />
            Adaugă produs
          </Button>
        }
      />

      {failed ? (
        <div role="alert">
          <EmptyState
            icon={<TriangleAlert />}
            title="Nu am putut încărca lista ta"
            description="Verifică conexiunea la internet și încearcă din nou."
            action={
              <Button variant="outline" disabled={cart.isFetching} onClick={() => cart.refetch()}>
                <RefreshCw aria-hidden="true" data-icon="inline-start" />
                Încearcă din nou
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-6">
          <OverviewStats items={items} loading={cart.isPending} />
          <div
            className={cn(
              "grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start",
              ENTER,
              ENTER_DELAY.medium,
            )}
          >
            <Watchlist
              items={items}
              loading={cart.isPending}
              selectedId={selected?.productId}
              onSelect={handleSelect}
              onAddProduct={focusAddProductForm}
              className={isEmpty ? "lg:col-span-2" : undefined}
            />
            {selected ? <ProductDetail item={selected} /> : null}
            {cart.isPending ? <ProductDetailSkeleton /> : null}
          </div>
        </div>
      )}

      <AddProductForm onAdded={handleAdded} className={cn("mt-8", ENTER, ENTER_DELAY.long)} />
    </>
  );
}

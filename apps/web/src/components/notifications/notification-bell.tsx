"use client";

import { Badge } from "@my-better-t-app/ui/components/badge";
import { Button } from "@my-better-t-app/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@my-better-t-app/ui/components/dropdown-menu";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { getProductHref } from "@/components/search/hrefs";
import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth-client";
import { formatBani } from "@/lib/format";
import { getStore } from "@/lib/stores";
import { trpc } from "@/utils/trpc";

import { loadReadKeys, notificationKey, saveReadKeys } from "./read-state";

const POLL_INTERVAL_MS = 15_000;

interface Alert {
  productId: string;
  representativeProductId: string;
  title: string;
  targetPrice: number;
  bestPrice: number;
  bestStore: string;
}

/** "o notificare necitită", "3 notificări necitite", "20 de notificări necitite". */
function unreadLabel(count: number): string {
  if (count === 0) {
    return "nicio notificare necitită";
  }
  if (count === 1) {
    return "o notificare necitită";
  }
  const lastTwo = count % 100;
  const of = count >= 20 && (lastTwo === 0 || lastTwo >= 20) ? "de " : "";
  return `${count} ${of}notificări necitite`;
}

function offerLine(item: Alert): string {
  return `${formatBani(item.bestPrice)} la ${getStore(item.bestStore).name}`;
}

/**
 * In-app price alerts: polls the products whose cheapest in-stock price (in any store) reached the
 * user's target and shows them in a menu, with an unread count kept in this browser. Nothing is bought.
 */
export function NotificationBell() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { data: session } = authClient.useSession();
  const signedIn = hydrated && Boolean(session);

  const query = useQuery(
    trpc.alerts.reached.queryOptions(undefined, {
      enabled: signedIn,
      // după o eroare nu mai întreabă la fiecare 15 secunde (fiecare eroare afișează un toast); revine la focus
      refetchInterval: (current) => (current.state.status === "error" ? false : POLL_INTERVAL_MS),
      refetchOnWindowFocus: true,
    }),
  );

  // serverul nu are localStorage: loadReadKeys întoarce [] acolo, iar nimic nu se afișează până la hidratare
  const [readKeys, setReadKeys] = useState<string[]>(loadReadKeys);
  const readSet = new Set(readKeys);

  useEffect(() => {
    saveReadKeys(readKeys);
  }, [readKeys]);

  function markRead(keys: readonly string[]) {
    setReadKeys((current) => {
      const missing = keys.filter((key) => !current.includes(key));
      return missing.length === 0 ? current : [...current, ...missing];
    });
  }

  function openItem(item: Alert) {
    markRead([notificationKey(item)]);
    router.push(getProductHref(item.representativeProductId));
  }

  // Cheile văzute la ultima încărcare; null până la prima, care nu afișează toast-uri.
  const knownKeys = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!signedIn) {
      knownKeys.current = null;
    }
  }, [signedIn]);

  useEffect(() => {
    const data = query.data;
    if (!(signedIn && data)) {
      return;
    }
    const known = knownKeys.current;
    knownKeys.current = new Set(data.map(notificationKey));
    if (known === null) {
      return;
    }
    for (const item of data) {
      const key = notificationKey(item);
      if (known.has(key) || readSet.has(key)) {
        continue;
      }
      toast.success("Preț țintă atins", {
        id: `price-alert-${key}`,
        description: `${item.title} · ${offerLine(item)}`,
        action: { label: "Vezi", onClick: () => openItem(item) },
      });
    }
  }, [query.data, signedIn, readSet, openItem]);

  if (!signedIn) {
    return null;
  }

  const items = query.data ?? [];
  const unreadKeys = items.map(notificationKey).filter((key) => !readSet.has(key));
  const unread = unreadKeys.length;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" className="relative" />}
          aria-label={`Notificări, ${unreadLabel(unread)}`}
        >
          <Bell aria-hidden="true" />
          {unread > 0 ? (
            <Badge
              aria-hidden="true"
              className="pointer-events-none absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px] tabular-nums leading-none"
            >
              {unread > 9 ? "9+" : unread}
            </Badge>
          ) : null}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center justify-between gap-2 font-semibold text-foreground text-sm">
              Notificări
              {unread > 0 ? (
                <Badge variant="secondary" className="tabular-nums">
                  {unread} {unread === 1 ? "nouă" : "noi"}
                </Badge>
              ) : null}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {query.isPending ? (
              <p className="px-2.5 py-6 text-center text-muted-foreground text-sm">
                Se încarcă notificările…
              </p>
            ) : null}
            {query.isError && items.length === 0 ? (
              <p className="px-2.5 py-6 text-center text-muted-foreground text-sm">
                Nu am putut încărca notificările. Încearcă din nou mai târziu.
              </p>
            ) : null}
            {query.isSuccess && items.length === 0 ? (
              <p className="px-2.5 py-6 text-center text-muted-foreground text-sm">
                Nicio notificare încă. Te anunțăm aici când prețul ajunge la ținta ta.
              </p>
            ) : null}
            {items.map((item) => {
              const key = notificationKey(item);
              const isUnread = !readSet.has(key);
              return (
                <DropdownMenuItem
                  key={key}
                  render={<Link href={getProductHref(item.representativeProductId)} />}
                  onClick={() => markRead([key])}
                  className="items-start"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      isUnread ? "bg-primary" : "bg-transparent",
                    )}
                  />
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block font-medium text-success text-xs">
                      Preț țintă atins
                      {isUnread ? <span className="sr-only"> (necitită)</span> : null}
                    </span>
                    <span className="block truncate font-medium">{item.title}</span>
                    <span className="block text-muted-foreground text-xs tabular-nums">
                      {offerLine(item)} · ținta ta {formatBani(item.targetPrice)}
                    </span>
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
          {items.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={unread === 0}
                closeOnClick={false}
                onClick={() => markRead(unreadKeys)}
              >
                <CheckCheck aria-hidden="true" />
                Marchează tot ca citit
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {unread > 0 ? `Ai ${unreadLabel(unread)}.` : ""}
      </span>
    </>
  );
}

export default NotificationBell;

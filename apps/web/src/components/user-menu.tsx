"use client";

import { Button, buttonVariants } from "@my-better-t-app/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@my-better-t-app/ui/components/dropdown-menu";
import { Skeleton } from "@my-better-t-app/ui/components/skeleton";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth-client";

export default function UserMenu() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { data: session, isPending } = authClient.useSession();

  // serverul nu are sesiunea: primul render de pe client trebuie să arate același skeleton
  if (isPending || !hydrated) {
    return <Skeleton className="h-10 w-24 sm:h-9" />;
  }

  if (!session) {
    return (
      <Link href="/login" className={buttonVariants()}>
        Conectare
      </Link>
    );
  }

  const { name, email } = session.user;
  const initial = (name || email).trim().charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="rounded-full px-1 md:pr-3" />}
        aria-label="Contul meu"
      >
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground text-sm"
        >
          {initial}
        </span>
        <span className="hidden max-w-32 truncate md:inline">{name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="space-y-0.5 py-2.5">
            <span className="block text-muted-foreground text-xs">Contul meu</span>
            <span className="block truncate font-medium text-foreground text-sm">{name}</span>
            <span className="block truncate text-muted-foreground text-xs">{email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    router.push("/");
                  },
                },
              });
            }}
          >
            <LogOut />
            Deconectare
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

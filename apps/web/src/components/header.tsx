"use client";

import { cn } from "@my-better-t-app/ui/lib/utils";
import { TrendingDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BRAND } from "@/lib/brand";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

const LINKS = [
  { href: "/", label: "Acasă" },
  { href: "/dashboard", label: "Panou" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-6 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <TrendingDown className="size-5" aria-hidden="true" />
          </span>
          <span className="font-semibold text-base tracking-tight max-sm:sr-only">
            {BRAND.name}
          </span>
        </Link>
        <nav aria-label="Navigare principală" className="flex items-center gap-1">
          {LINKS.map(({ href, label }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center rounded-lg px-3 font-medium text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:h-9",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <ModeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

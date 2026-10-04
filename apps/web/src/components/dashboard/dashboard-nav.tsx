"use client";

import { cn } from "@my-better-t-app/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Prezentare" },
  { href: "/dashboard/cart", label: "Coș și optimizare" },
  { href: "/dashboard/broker", label: "Broker automat" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Secțiuni panou"
      className="no-scrollbar -mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:mb-8 sm:px-0"
    >
      <ul className="flex w-max min-w-full gap-1 rounded-xl bg-muted p-1 sm:min-w-0">
        {TABS.map(({ href, label }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center whitespace-nowrap rounded-lg px-4 font-medium text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:h-9",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

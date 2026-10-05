"use client";

import { cn } from "@my-better-t-app/ui/lib/utils";
import { TrendingDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { BRAND } from "@/lib/brand";

import { ModeToggle } from "./mode-toggle";
import { NotificationBell } from "./notifications/notification-bell";
import UserMenu from "./user-menu";

const LINKS = [
	{ href: "/", label: "Acasă" },
	{ href: "/cauta", label: "Caută" },
	{ href: "/dashboard", label: "Panou" },
] as const;

/** Scroll distance after which the header turns solid. */
const SOLID_AFTER_PX = 16;

function isActive(pathname: string, href: string): boolean {
	if (href === "/") {
		return pathname === "/";
	}
	return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Sticky header. On the landing page, at the very top, it is transparent over the dark hero
 * (the `dark` class switches its tokens so it reads on the hero in either theme); after
 * scrolling, and on every other page, it is solid with a blur in the current theme.
 */
export default function Header() {
	const pathname = usePathname();
	const [scrolled, setScrolled] = useState(false);

	useEffect(() => {
		const update = () => setScrolled(window.scrollY > SOLID_AFTER_PX);
		update();
		window.addEventListener("scroll", update, { passive: true });
		return () => window.removeEventListener("scroll", update);
	}, []);

	const overHero = pathname === "/" && !scrolled;

	return (
		<header
			className={cn(
				"sticky top-0 z-40 w-full border-b text-foreground transition-[background-color,border-color] duration-500",
				overHero
					? "dark border-transparent bg-transparent"
					: "border-border/70 bg-background/80 backdrop-blur-xl"
			)}
		>
			<div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-8 sm:px-6">
				<Link
					className="flex shrink-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
					href="/"
				>
					<span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-lg shadow-primary/30">
						<TrendingDown aria-hidden="true" className="size-4.5" />
					</span>
					<span className="font-semibold text-[0.8rem] uppercase tracking-[0.42em] max-sm:sr-only">
						{BRAND.name}
					</span>
				</Link>
				<nav
					aria-label="Navigare principală"
					className="flex items-center gap-0.5 sm:gap-1"
				>
					{LINKS.map(({ href, label }) => {
						const active = isActive(pathname, href);
						return (
							<Link
								aria-current={active ? "page" : undefined}
								className={cn(
									"relative flex h-10 items-center rounded-md px-2.5 font-medium text-[0.7rem] uppercase tracking-[0.16em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:px-3 sm:tracking-[0.22em]",
									"after:absolute after:inset-x-2.5 after:bottom-1 after:h-px after:origin-left after:bg-primary after:transition-transform after:duration-300 sm:after:inset-x-3",
									// pe telefon, logo-ul duce deja acasă, iar trei linkuri nu încap lângă butoane
									href === "/" && "max-sm:hidden",
									active
										? "text-foreground after:scale-x-100"
										: "text-muted-foreground after:scale-x-0 hover:text-foreground hover:after:scale-x-100"
								)}
								href={href}
								key={href}
							>
								{label}
							</Link>
						);
					})}
				</nav>
				<div className="ml-auto flex items-center gap-1 sm:gap-2">
					<NotificationBell />
					<ModeToggle />
					<UserMenu />
				</div>
			</div>
		</header>
	);
}

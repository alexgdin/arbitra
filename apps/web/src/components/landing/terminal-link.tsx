"use client";

import { cn } from "@my-better-t-app/ui/lib/utils";
import type { Route } from "next";
import Link from "next/link";

import { useScramble } from "@/components/motion/scramble-text";
import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth-client";

type Variant = "primary" | "ghost";

const CORNERS = [
	"top-0 left-0 border-t border-l group-hover:-translate-x-1 group-hover:-translate-y-1 group-focus-visible:-translate-x-1 group-focus-visible:-translate-y-1",
	"top-0 right-0 border-t border-r group-hover:translate-x-1 group-hover:-translate-y-1 group-focus-visible:translate-x-1 group-focus-visible:-translate-y-1",
	"bottom-0 left-0 border-b border-l group-hover:-translate-x-1 group-hover:translate-y-1 group-focus-visible:-translate-x-1 group-focus-visible:translate-y-1",
	"bottom-0 right-0 border-r border-b group-hover:translate-x-1 group-hover:translate-y-1 group-focus-visible:translate-x-1 group-focus-visible:translate-y-1",
] as const;

const VARIANTS: Record<
	Variant,
	{ link: string; corner: string; prompt: string }
> = {
	ghost: {
		corner: "border-foreground/50",
		link: "text-foreground/80 hover:bg-white/5 hover:text-foreground",
		prompt: "text-muted-foreground",
	},
	primary: {
		corner: "border-primary",
		link: "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground",
		prompt: "text-primary group-hover:text-primary-foreground",
	},
};

/**
 * Terminal-style call to action: thin corner brackets, mono uppercase label that scrambles
 * briefly on hover or focus. The real label stays available to screen readers.
 */
export function TerminalLink<T extends string>({
	href,
	label,
	variant = "primary",
	className,
}: {
	href: Route<T>;
	label: string;
	variant?: Variant;
	className?: string;
}) {
	const [display, play] = useScramble(label);
	const styles = VARIANTS[variant];

	return (
		<Link
			className={cn(
				"group relative inline-flex h-12 min-w-56 items-center justify-center gap-3 px-6 font-mono text-xs uppercase tracking-[0.28em] outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
				styles.link,
				className
			)}
			href={href}
			onFocus={play}
			onMouseEnter={play}
		>
			{CORNERS.map((corner) => (
				<span
					aria-hidden="true"
					className={cn(
						"pointer-events-none absolute size-2.5 transition-transform duration-300",
						styles.corner,
						corner
					)}
					key={corner}
				/>
			))}
			<span
				aria-hidden="true"
				className={cn("transition-colors", styles.prompt)}
			>
				&gt;
			</span>
			<span aria-hidden="true" className="whitespace-pre">
				{display}
			</span>
			<span className="sr-only">{label}</span>
			{variant === "primary" ? (
				<span
					aria-hidden="true"
					className="-ml-1.5 h-3.5 w-[0.6em] animate-[arbitra-blink_1.1s_steps(1)_infinite] bg-current motion-reduce:animate-none"
				/>
			) : null}
		</Link>
	);
}

/** Secondary CTA: "Intră în cont" for visitors, "Deschide panoul" once signed in. */
export function AccountLink({ className }: { className?: string }) {
	const hydrated = useHydrated();
	const { data: session } = authClient.useSession();
	const signedIn = hydrated && Boolean(session);

	return signedIn ? (
		<TerminalLink
			className={className}
			href="/dashboard"
			label="Deschide panoul"
			variant="ghost"
		/>
	) : (
		<TerminalLink
			className={className}
			href="/login"
			label="Intră în cont"
			variant="ghost"
		/>
	);
}

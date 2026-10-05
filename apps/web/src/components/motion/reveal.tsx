"use client";

import { cn } from "@my-better-t-app/ui/lib/utils";
import type { ReactNode } from "react";

import { useReveal } from "./use-reveal";

/**
 * Fades and lifts its children in when they scroll into view (or when the intro lifts).
 * The server render and reduced motion show the content as is; focus reveals it at once.
 */
export function Reveal({
	children,
	className,
	delay = 0,
	trigger = "in-view",
}: {
	children: ReactNode;
	className?: string;
	/** Stagger, in milliseconds. */
	delay?: number;
	trigger?: "in-view" | "intro";
}) {
	const [ref, state, reveal] = useReveal<HTMLDivElement>({ trigger });

	return (
		<div
			className={cn(
				state === "hidden" && "translate-y-6 opacity-0",
				state === "shown" &&
					"translate-y-0 opacity-100 transition-[opacity,translate] duration-900 ease-[cubic-bezier(0.22,1,0.36,1)]",
				className
			)}
			onFocusCapture={reveal}
			ref={ref}
			style={
				state === "shown" && delay > 0
					? { transitionDelay: `${delay}ms` }
					: undefined
			}
		>
			{children}
		</div>
	);
}

"use client";

import { useEffect, useRef, useState } from "react";

import { introIsPending, whenIntroDone } from "./intro";
import { prefersReducedMotion } from "./reduced-motion";

/**
 * "static": final state, no animation (server render, reduced motion, already on screen).
 * "hidden": waiting off screen (or behind the intro). "shown": animating to the final state.
 */
export type RevealState = "static" | "hidden" | "shown";

interface RevealOptions {
	/** Also hide and replay elements that are already visible on mount (for self-contained demos). */
	replayVisible?: boolean;
	threshold?: number;
	/** "in-view" waits for the element to scroll in; "intro" waits for the intro overlay to lift. */
	trigger?: "in-view" | "intro";
}

function isOnScreen(element: Element): boolean {
	const rect = element.getBoundingClientRect();
	return rect.top < window.innerHeight && rect.bottom > 0;
}

export function useReveal<T extends HTMLElement>({
	trigger = "in-view",
	replayVisible = false,
	threshold = 0.15,
}: RevealOptions = {}) {
	const ref = useRef<T>(null);
	const [state, setState] = useState<RevealState>("static");

	useEffect(() => {
		const element: HTMLElement | null = ref.current;
		if (!element || prefersReducedMotion()) {
			return;
		}

		if (trigger === "intro") {
			// animate only when an intro actually covers the page; otherwise keep the server render
			if (!introIsPending()) {
				return;
			}
			setState("hidden");
			return whenIntroDone(() => setState("shown"));
		}

		if (typeof IntersectionObserver === "undefined") {
			return;
		}
		if (!replayVisible && isOnScreen(element)) {
			setState((current) => (current === "hidden" ? "shown" : current));
			return;
		}

		setState("hidden");
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					setState("shown");
					observer.disconnect();
				}
			},
			{ rootMargin: "0px 0px -8% 0px", threshold }
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [trigger, replayVisible, threshold]);

	/** Keyboard safety: focusing anything inside reveals it at once. */
	const reveal = () =>
		setState((current) => (current === "hidden" ? "shown" : current));

	return [ref, state, reveal] as const;
}

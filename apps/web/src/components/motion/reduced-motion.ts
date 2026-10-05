import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** Client-only check. Call it from effects or event handlers, never during render. */
export function prefersReducedMotion(): boolean {
	if (
		typeof window === "undefined" ||
		typeof window.matchMedia !== "function"
	) {
		return true;
	}
	return window.matchMedia(QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
	if (typeof window.matchMedia !== "function") {
		return () => undefined;
	}
	const media = window.matchMedia(QUERY);
	media.addEventListener("change", onChange);
	return () => media.removeEventListener("change", onChange);
}

/** True on the server and during hydration, so the static (final) state is what renders first. */
export function useReducedMotion(): boolean {
	return useSyncExternalStore(subscribe, prefersReducedMotion, () => true);
}

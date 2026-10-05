import type { CSSProperties } from "react";

/** Milliseconds between two items of a staggered list. */
const STEP_MS = 60;
/** Items after this one enter together, so long lists never keep content waiting. */
const MAX_STEPS = 8;

/**
 * Inline style for an `arbitra-enter` item (see globals.css): its entrance delay in the list.
 * Use with the `arbitra-enter` class; reduced motion skips the animation entirely.
 */
export function staggerStyle(index: number, step = STEP_MS): CSSProperties {
	return {
		"--arbitra-delay": `${Math.min(index, MAX_STEPS) * step}ms`,
	} as CSSProperties;
}

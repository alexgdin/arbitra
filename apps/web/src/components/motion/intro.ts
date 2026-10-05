import { prefersReducedMotion } from "./reduced-motion";

/**
 * Shared state between the intro overlay and the hero animations, so the headline starts
 * decoding as the curtain lifts instead of behind it. Client-only: call from effects.
 */
const SESSION_KEY = "arbitra:intro-seen";
/** Safety net: hero animations never wait longer than this for the intro. */
const MAX_WAIT_MS = 3200;

let willPlay: boolean | null = null;
let done = false;
const listeners = new Set<() => void>();

/** True while the intro overlay should be (or is being) shown on this page load. */
export function introIsPending(): boolean {
	if (willPlay === null) {
		let seen = true;
		try {
			seen = window.sessionStorage.getItem(SESSION_KEY) === "1";
			window.sessionStorage.setItem(SESSION_KEY, "1");
		} catch {
			// storage blocked: skip the intro rather than show it on every visit
			seen = true;
		}
		willPlay = !(seen || prefersReducedMotion());
	}
	return willPlay && !done;
}

export function markIntroDone(): void {
	if (done) {
		return;
	}
	done = true;
	for (const listener of listeners) {
		listener();
	}
	listeners.clear();
}

/** Runs `callback` once the intro is gone (immediately when there is none). Returns a cancel function. */
export function whenIntroDone(callback: () => void): () => void {
	if (!introIsPending()) {
		callback();
		return () => undefined;
	}
	let called = false;
	const run = () => {
		if (!called) {
			called = true;
			window.clearTimeout(timer);
			listeners.delete(run);
			callback();
		}
	};
	const timer = window.setTimeout(run, MAX_WAIT_MS);
	listeners.add(run);
	return () => {
		called = true;
		window.clearTimeout(timer);
		listeners.delete(run);
	};
}

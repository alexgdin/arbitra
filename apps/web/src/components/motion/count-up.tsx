"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { formatBani } from "@/lib/format";

import { prefersReducedMotion } from "./reduced-motion";

const DURATION_MS = 1100;

function formatValue(value: number, currency: string | undefined): string {
	return currency ? formatBani(value, currency) : String(value);
}

/** useLayoutEffect in the browser (no flash of the final value before counting starts). */
const useIsomorphicLayoutEffect =
	typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A number that counts up to `value` once it scrolls into view, and tweens from the previous
 * value when it changes. The server render and reduced motion show the final value; screen
 * readers always get the final value through an sr-only copy (the moving digits are aria-hidden).
 * With `currency` the value is an amount in bani, formatted with formatBani.
 */
export function CountUp({
	value,
	currency,
	className,
	duration = DURATION_MS,
}: {
	value: number;
	currency?: string;
	className?: string;
	duration?: number;
}) {
	const ref = useRef<HTMLSpanElement>(null);
	const shownRef = useRef(0);
	const [display, setDisplay] = useState<number | null>(null);

	useIsomorphicLayoutEffect(() => {
		const element = ref.current;
		const from = shownRef.current;
		if (
			!element ||
			from === value ||
			!Number.isFinite(value) ||
			prefersReducedMotion() ||
			typeof IntersectionObserver === "undefined"
		) {
			shownRef.current = value;
			setDisplay(null);
			return;
		}

		setDisplay(from);
		let raf = 0;
		const run = () => {
			let startedAt = 0;
			const tick = (now: number) => {
				if (!startedAt) {
					startedAt = now;
				}
				const progress = Math.min(1, (now - startedAt) / duration);
				if (progress >= 1) {
					shownRef.current = value;
					setDisplay(null);
					return;
				}
				const eased = 1 - (1 - progress) ** 3;
				const current = Math.round(from + (value - from) * eased);
				// a value change mid-count continues from what is on screen
				shownRef.current = current;
				setDisplay(current);
				raf = requestAnimationFrame(tick);
			};
			raf = requestAnimationFrame(tick);
		};

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					observer.disconnect();
					run();
				}
			},
			{ threshold: 0.4 }
		);
		observer.observe(element);

		return () => {
			observer.disconnect();
			cancelAnimationFrame(raf);
		};
	}, [value, duration]);

	const final = formatValue(value, currency);

	return (
		<span className={className} ref={ref}>
			<span className="sr-only">{final}</span>
			<span aria-hidden="true">
				{display === null ? final : formatValue(display, currency)}
			</span>
		</span>
	);
}

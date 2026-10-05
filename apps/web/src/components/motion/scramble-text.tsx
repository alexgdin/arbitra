"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { whenIntroDone } from "./intro";
import { prefersReducedMotion } from "./reduced-motion";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>$@";
/** How often unresolved characters change, in milliseconds. */
const SHUFFLE_MS = 55;
/** Time a resolved character needs to sharpen (matches arbitra-char-in). */
const SETTLE_MS = 650;
const WHITESPACE_SPLIT = /(\s+)/;

function randomGlyph(): string {
	return GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
}

function isBlank(char: string): boolean {
	return char.trim() === "";
}

interface Token {
	blank: boolean;
	start: number;
	value: string;
}

/** Splits into words and whitespace, keeping each token's offset into Array.from(text). */
function tokenize(text: string): Token[] {
	const tokens: Token[] = [];
	let start = 0;
	for (const value of text.split(WHITESPACE_SPLIT)) {
		if (value) {
			tokens.push({ blank: isBlank(value), start, value });
			start += Array.from(value).length;
		}
	}
	return tokens;
}

interface Frame {
	glyphs: string[];
	settled: boolean[];
}

/**
 * Text that resolves letter by letter from blurred, scrambled characters ("decode").
 * The server render and reduced motion show the final text; screen readers always get the
 * real text through an sr-only copy, the animated glyphs are aria-hidden.
 */
export function ScrambleText({
	text,
	className,
	start = "mount",
	delay = 0,
	stagger = 42,
}: {
	text: string;
	className?: string;
	/** "intro" waits for the intro overlay, "in-view" for the text to scroll into view. */
	start?: "mount" | "intro" | "in-view";
	delay?: number;
	/** Milliseconds between two characters resolving. */
	stagger?: number;
}) {
	const ref = useRef<HTMLSpanElement>(null);
	const [frame, setFrame] = useState<Frame | null>(null);

	useEffect(() => {
		const element: HTMLElement | null = ref.current;
		if (!element || prefersReducedMotion()) {
			return;
		}

		const chars = Array.from(text);
		const blank = chars.map(isBlank);
		const settleAt = chars.map(
			(_, index) => delay + index * stagger + Math.random() * stagger * 5
		);
		const end = Math.max(0, ...settleAt) + SETTLE_MS;
		const glyphs = chars.map((char, index) =>
			blank[index] ? char : randomGlyph()
		);
		setFrame({ glyphs: [...glyphs], settled: [...blank] });

		let raf = 0;
		let startedAt = 0;
		let shuffledAt = 0;
		const tick = (now: number) => {
			if (!startedAt) {
				startedAt = now;
			}
			const elapsed = now - startedAt;
			const settled = settleAt.map(
				(at, index) => blank[index] || elapsed >= at
			);
			if (now - shuffledAt >= SHUFFLE_MS) {
				shuffledAt = now;
				for (let index = 0; index < glyphs.length; index += 1) {
					if (!settled[index]) {
						glyphs[index] = randomGlyph();
					}
				}
			}
			if (elapsed >= end) {
				setFrame(null);
				return;
			}
			setFrame({ glyphs: [...glyphs], settled });
			raf = requestAnimationFrame(tick);
		};
		const begin = () => {
			raf = requestAnimationFrame(tick);
		};

		let cancelStart: () => void = () => undefined;
		if (start === "intro") {
			cancelStart = whenIntroDone(begin);
		} else if (
			start === "in-view" &&
			typeof IntersectionObserver !== "undefined"
		) {
			const observer = new IntersectionObserver(
				(entries) => {
					if (entries.some((entry) => entry.isIntersecting)) {
						observer.disconnect();
						begin();
					}
				},
				{ threshold: 0.4 }
			);
			observer.observe(element);
			cancelStart = () => observer.disconnect();
		} else {
			begin();
		}

		return () => {
			cancelStart();
			cancelAnimationFrame(raf);
		};
	}, [text, start, delay, stagger]);

	const tokens = tokenize(text);

	return (
		<span className={className} ref={ref}>
			<span className="sr-only">{text}</span>
			<span aria-hidden="true">
				{tokens.map((token) => {
					if (token.blank) {
						return token.value;
					}
					if (!frame) {
						return (
							<span
								className="inline-block whitespace-nowrap"
								key={token.start}
							>
								{token.value}
							</span>
						);
					}
					return (
						<span className="inline-block whitespace-nowrap" key={token.start}>
							{Array.from(token.value).map((char, offset) => {
								const index = token.start + offset;
								if (frame.settled[index]) {
									return (
										<span
											className="inline-block animate-[arbitra-char-in_650ms_cubic-bezier(0.22,1,0.36,1)_both]"
											key={index}
										>
											{char}
										</span>
									);
								}
								return (
									<span className="relative inline-block" key={index}>
										<span className="invisible">{char}</span>
										<span className="absolute top-0 left-0 text-primary/70 opacity-70 blur-[2px]">
											{frame.glyphs[index]}
										</span>
									</span>
								);
							})}
						</span>
					);
				})}
			</span>
		</span>
	);
}

/**
 * Brief scramble for hover/focus labels: returns the text to display and a trigger.
 * Pair it with an sr-only copy of the real label; it does nothing with reduced motion.
 */
export function useScramble(text: string, duration = 420) {
	const [scrambled, setScrambled] = useState<string | null>(null);
	const rafRef = useRef(0);

	useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

	const play = useCallback(() => {
		if (prefersReducedMotion()) {
			return;
		}
		cancelAnimationFrame(rafRef.current);
		const chars = Array.from(text);
		const startedAt = performance.now();
		let shuffledAt = 0;
		const tick = (now: number) => {
			const progress = Math.min(1, (now - startedAt) / duration);
			if (progress >= 1) {
				setScrambled(null);
				return;
			}
			if (now - shuffledAt >= 40) {
				shuffledAt = now;
				setScrambled(
					chars
						.map((char, index) =>
							isBlank(char) || index / chars.length < progress
								? char
								: randomGlyph()
						)
						.join("")
				);
			}
			rafRef.current = requestAnimationFrame(tick);
		};
		rafRef.current = requestAnimationFrame(tick);
	}, [text, duration]);

	return [scrambled ?? text, play] as const;
}

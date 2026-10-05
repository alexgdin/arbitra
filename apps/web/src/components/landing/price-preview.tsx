"use client";

import { Badge } from "@my-better-t-app/ui/components/badge";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { BellRing, Target } from "lucide-react";
import { useEffect, useState } from "react";

import { useReveal } from "@/components/motion/use-reveal";
import { PriceDelta } from "@/components/price-delta";
import { StoreBadge } from "@/components/store-badge";
import { formatBani } from "@/lib/format";

/** Example data, in bani. The preview is illustrative and not tied to a real product. */
const START_PRICE = 339_900;
const CURRENT_PRICE = 289_900;
const TARGET_PRICE = 295_000;
const HISTORY = [
	START_PRICE,
	START_PRICE,
	334_900,
	337_900,
	329_900,
	319_900,
	322_900,
	309_900,
	304_900,
	299_900,
	292_900,
	CURRENT_PRICE,
];

const SAVED = START_PRICE - CURRENT_PRICE;
const CHANGE_PCT = (SAVED / START_PRICE) * -100;

const WIDTH = 320;
const HEIGHT = 112;
const PAD = 12;
const MAX = Math.max(...HISTORY, TARGET_PRICE);
const MIN = Math.min(...HISTORY, TARGET_PRICE);

function toX(index: number): number {
	return PAD + (index / (HISTORY.length - 1)) * (WIDTH - PAD * 2);
}

function toY(price: number): number {
	return PAD + ((MAX - price) / (MAX - MIN)) * (HEIGHT - PAD * 2);
}

const POINTS = HISTORY.map(
	(price, index) => `${toX(index).toFixed(1)},${toY(price).toFixed(1)}`
);
const LINE_PATH = `M${POINTS.join(" L")}`;
const AREA_PATH = `${LINE_PATH} L${toX(HISTORY.length - 1).toFixed(1)},${HEIGHT} L${toX(0).toFixed(1)},${HEIGHT} Z`;
const TARGET_Y = toY(TARGET_PRICE);
const END_X = toX(HISTORY.length - 1);
const END_Y = toY(CURRENT_PRICE);

/** Line draw and price count-down share this run time. */
const PLAY_MS = 2000;
const EASE_IN_OUT = "cubic-bezier(0.65,0,0.35,1)";

const DESCRIPTION = `Exemplu de produs urmărit: prețul unui laptop a scăzut de la ${formatBani(START_PRICE)} la ${formatBani(CURRENT_PRICE)}, sub ținta de ${formatBani(TARGET_PRICE)}, iar alerta a apărut în aplicație. Economie: ${formatBani(SAVED)}.`;

/** Price along the history at progress 0..1, rounded to whole lei while it moves. */
function priceAt(progress: number): number {
	if (progress >= 1) {
		return CURRENT_PRICE;
	}
	const position = progress * (HISTORY.length - 1);
	const index = Math.floor(position);
	const from = HISTORY[index] ?? START_PRICE;
	const to = HISTORY[index + 1] ?? CURRENT_PRICE;
	return Math.round((from + (to - from) * (position - index)) / 100) * 100;
}

function easeInOut(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Glass card for the dark hero: the price line draws itself, the price counts down and a
 * "Țintă atinsă" badge pops in once it crosses the target. Server render and reduced motion
 * show the final state; the whole card is one labelled image for screen readers.
 */
export function PricePreview() {
	const [ref, state] = useReveal<HTMLDivElement>({
		replayVisible: true,
		threshold: 0.35,
	});
	const [price, setPrice] = useState(CURRENT_PRICE);

	const playing = state === "shown";
	const waiting = state === "hidden";
	const hit = state === "static" || (playing && price <= TARGET_PRICE);

	useEffect(() => {
		if (state === "hidden") {
			setPrice(START_PRICE);
			return;
		}
		if (state !== "shown") {
			return;
		}
		let raf = 0;
		const startedAt = performance.now();
		const tick = (now: number) => {
			const t = Math.min(1, (now - startedAt) / PLAY_MS);
			setPrice(priceAt(easeInOut(t)));
			if (t < 1) {
				raf = requestAnimationFrame(tick);
			}
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [state]);

	const drawStyle = {
		strokeDashoffset: waiting ? 1 : 0,
		transition: playing
			? `stroke-dashoffset ${PLAY_MS}ms ${EASE_IN_OUT}`
			: "none",
	};

	return (
		<div
			aria-label={DESCRIPTION}
			className="relative mx-auto w-full max-w-md"
			ref={ref}
			role="img"
		>
			<div
				aria-hidden="true"
				className="absolute -inset-8 -z-10 rounded-[2.5rem] bg-[radial-gradient(closest-side,oklch(0.74_0.16_164/0.22),transparent)]"
			/>
			<div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-foreground shadow-2xl shadow-black/50 ring-1 ring-white/5 ring-inset backdrop-blur-xl sm:p-6">
				<div className="flex items-center justify-between gap-3">
					<StoreBadge store="emag" />
					<Badge
						className={cn(
							waiting && "scale-75 opacity-0",
							playing && !hit && "scale-75 opacity-0",
							playing &&
								hit &&
								"animate-[arbitra-pop_520ms_cubic-bezier(0.34,1.56,0.64,1)_both]"
						)}
						variant="warning"
					>
						<Target aria-hidden="true" />
						Țintă atinsă
					</Badge>
				</div>

				<div className="space-y-1">
					<p className="font-medium text-sm leading-snug">
						Laptop ASUS Vivobook 15, 16 GB RAM, 512 GB SSD
					</p>
					<p className="font-mono text-[0.65rem] text-muted-foreground uppercase tracking-[0.2em]">
						Evoluția prețului · 30 de zile
					</p>
				</div>

				<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
					<span
						className={cn(
							"font-semibold text-3xl tabular-nums tracking-tight transition-colors duration-500",
							hit ? "text-primary" : "text-foreground"
						)}
					>
						{formatBani(price)}
					</span>
					<span className="text-muted-foreground text-sm tabular-nums line-through">
						{formatBani(START_PRICE)}
					</span>
					<span
						className={cn(
							"transition-opacity duration-500",
							hit ? "opacity-100" : "opacity-0"
						)}
					>
						<PriceDelta value={CHANGE_PCT} />
					</span>
				</div>

				<div>
					<svg
						aria-hidden="true"
						className="h-auto w-full overflow-visible"
						viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
					>
						<defs>
							<linearGradient
								id="arbitra-preview-area"
								x1="0"
								x2="0"
								y1="0"
								y2="1"
							>
								<stop
									offset="0%"
									stopColor="var(--chart-line)"
									stopOpacity="0.35"
								/>
								<stop
									offset="100%"
									stopColor="var(--chart-line)"
									stopOpacity="0"
								/>
							</linearGradient>
						</defs>
						<path
							className={cn(
								"transition-opacity",
								waiting ? "opacity-0" : "opacity-100",
								playing && "delay-[900ms] duration-[1200ms]"
							)}
							d={AREA_PATH}
							fill="url(#arbitra-preview-area)"
						/>
						<line
							className="stroke-warning"
							strokeDasharray="4 5"
							strokeWidth={1.25}
							x1={0}
							x2={WIDTH}
							y1={TARGET_Y}
							y2={TARGET_Y}
						/>
						<path
							className="stroke-chart-line"
							d={LINE_PATH}
							fill="none"
							pathLength={1}
							strokeDasharray="1 1"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2.5}
							style={drawStyle}
						/>
						<g
							className={cn(
								"origin-center [transform-box:fill-box]",
								waiting && "opacity-0",
								playing && "animate-[arbitra-pop_500ms_ease-out_1900ms_both]"
							)}
						>
							{playing ? (
								<circle
									className="origin-center animate-[arbitra-ping_1.6s_ease-out_2.2s_infinite] fill-primary/40 [transform-box:fill-box] motion-reduce:hidden"
									cx={END_X}
									cy={END_Y}
									r={5}
								/>
							) : null}
							<circle
								className="fill-background stroke-chart-line"
								cx={END_X}
								cy={END_Y}
								r={5}
								strokeWidth={2.5}
							/>
						</g>
					</svg>
					<p className="mt-2 flex items-center gap-2 text-muted-foreground text-xs">
						<span
							aria-hidden="true"
							className="inline-block w-5 border-warning border-t-2 border-dashed"
						/>
						Prețul tău țintă:{" "}
						<span className="tabular-nums">{formatBani(TARGET_PRICE)}</span>
					</p>
				</div>
			</div>

			<div
				className={cn(
					"absolute -bottom-6 left-4 flex items-center gap-3 rounded-xl border border-white/10 bg-[oklch(0.2_0.024_262/0.9)] px-3.5 py-2.5 shadow-xl backdrop-blur-md sm:-left-8",
					(waiting || (playing && !hit)) && "translate-y-3 opacity-0",
					playing &&
						hit &&
						"animate-[arbitra-rise_600ms_cubic-bezier(0.22,1,0.36,1)_250ms_both]"
				)}
			>
				<span className="relative flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
					<BellRing aria-hidden="true" className="size-4" />
				</span>
				<div>
					<p className="font-medium text-xs">Alertă în aplicație</p>
					<p className="text-muted-foreground text-xs">
						Prețul a ajuns la ținta ta
					</p>
				</div>
			</div>
		</div>
	);
}

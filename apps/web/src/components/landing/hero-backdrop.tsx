const GRID =
	"linear-gradient(to right, oklch(1 0 0 / 0.07) 1px, transparent 1px), linear-gradient(to bottom, oklch(1 0 0 / 0.07) 1px, transparent 1px)";
const GRID_MASK =
	"radial-gradient(70% 60% at 50% 38%, black 20%, transparent 100%)";

/** Falling light streaks on thin vertical rules: [left, delay, duration]. */
const BEAMS = [
	["12%", "0s", "9s"],
	["38%", "3.2s", "11s"],
	["63%", "1.4s", "8s"],
	["88%", "5s", "12s"],
] as const;

/**
 * Pure-CSS cinematic background for the dark hero: a slowly drifting grid, soft emerald
 * glows and light streaks running down thin rules. Only transforms animate; everything is
 * clipped to the section, so nothing can cause horizontal scroll.
 */
export function HeroBackdrop() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
		>
			<div className="absolute top-[-30vmax] left-1/2 size-[90vmax] -translate-x-1/2 animate-[arbitra-float_22s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,oklch(0.74_0.16_164/0.26),transparent)] motion-reduce:animate-none" />
			<div className="absolute right-[-25vmax] bottom-[-35vmax] size-[70vmax] animate-[arbitra-float_28s_ease-in-out_infinite_reverse] rounded-full bg-[radial-gradient(closest-side,oklch(0.7_0.12_200/0.16),transparent)] motion-reduce:animate-none" />

			<div
				className="absolute inset-0"
				style={{ maskImage: GRID_MASK, WebkitMaskImage: GRID_MASK }}
			>
				<div
					className="absolute -inset-12 animate-[arbitra-grid-drift_16s_linear_infinite] motion-reduce:animate-none"
					style={{ backgroundImage: GRID, backgroundSize: "48px 48px" }}
				/>
			</div>

			{BEAMS.map(([left, delay, duration]) => (
				<div
					className="absolute inset-y-0 w-px bg-white/[0.04]"
					key={left}
					style={{ left }}
				>
					<div
						className="absolute top-0 left-0 h-48 w-px animate-[arbitra-fall_linear_infinite_both] bg-linear-to-b from-transparent via-primary/70 to-transparent motion-reduce:hidden"
						style={{ animationDelay: delay, animationDuration: duration }}
					/>
				</div>
			))}

			<div className="absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent" />
			<div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,transparent_55%,oklch(0.1_0.02_262/0.85))]" />
		</div>
	);
}

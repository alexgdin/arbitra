import { getStore, STORE_IDS } from "@/lib/stores";

const CLAIMS = [
	"Același produs, după EAN",
	"Istoric de prețuri",
	"Alertă la prețul țintă",
	"Coș optimizat, transport inclus",
	"Extensie de browser",
] as const;

function Row({ hidden = false }: { hidden?: boolean }) {
	return (
		<ul
			aria-hidden={hidden || undefined}
			className="flex shrink-0 items-center gap-10 pr-10 font-mono text-[0.68rem] uppercase tracking-[0.32em] sm:gap-14 sm:pr-14 sm:text-xs"
		>
			{STORE_IDS.map((id) => {
				const { name, colorVar } = getStore(id);
				return (
					<li
						className="flex items-center gap-3 whitespace-nowrap text-foreground"
						key={id}
					>
						<span
							aria-hidden="true"
							className="size-2 rounded-full"
							style={{ backgroundColor: colorVar }}
						/>
						{name}
					</li>
				);
			})}
			{CLAIMS.map((claim) => (
				<li
					className="flex items-center gap-10 whitespace-nowrap text-muted-foreground sm:gap-14"
					key={claim}
				>
					<span aria-hidden="true" className="text-primary">
						✦
					</span>
					{claim}
				</li>
			))}
		</ul>
	);
}

/**
 * Infinite strip of the stores and short claims. Two identical rows slide by half their
 * width, so the loop is seamless; the copy is aria-hidden and everything is clipped.
 */
export function Marquee() {
	return (
		<section
			aria-label="Magazine monitorizate și funcții"
			className="arbitra-stage dark relative overflow-hidden border-white/10 border-y py-6 text-foreground"
		>
			<div className="flex w-max animate-[arbitra-marquee_45s_linear_infinite] motion-reduce:animate-none hover:[animation-play-state:paused]">
				<Row />
				<Row hidden />
			</div>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-linear-to-r from-[oklch(0.13_0.02_262)] to-transparent sm:w-32"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-linear-to-l from-[oklch(0.13_0.02_262)] to-transparent sm:w-32"
			/>
		</section>
	);
}

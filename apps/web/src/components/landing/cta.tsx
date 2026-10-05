import { Reveal } from "@/components/motion/reveal";
import { ScrambleText } from "@/components/motion/scramble-text";
import { BRAND } from "@/lib/brand";

import { AccountLink, TerminalLink } from "./terminal-link";

const GLOW =
	"radial-gradient(60% 70% at 50% 0%, oklch(0.74 0.16 164 / 0.22), transparent), radial-gradient(40% 60% at 100% 100%, oklch(0.7 0.12 200 / 0.12), transparent)";

/** Final dark band: decoded headline, terminal CTAs and a giant outlined wordmark. */
export function Cta() {
	return (
		<section
			aria-labelledby="cta-title"
			className="arbitra-stage dark relative isolate overflow-hidden px-4 pt-24 pb-40 text-center text-foreground sm:px-6 sm:pt-32 sm:pb-56"
		>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 -z-10"
				style={{ backgroundImage: GLOW }}
			/>
			<p
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 translate-y-[28%] select-none whitespace-nowrap font-semibold text-[15vw] text-transparent uppercase leading-none tracking-[0.1em] [-webkit-text-stroke:1px_oklch(1_0_0/0.09)]"
			>
				{BRAND.name}
			</p>

			<div className="mx-auto max-w-4xl">
				<p className="font-mono text-[0.65rem] text-primary uppercase tracking-[0.4em]">
					<span aria-hidden="true">[ 03 ] </span>
					Începe acum
				</p>
				<h2
					className="mt-8 font-semibold text-[clamp(1.9rem,5vw,4rem)] uppercase leading-[1.05] tracking-[0.08em]"
					id="cta-title"
				>
					<ScrambleText start="in-view" text="Nu mai plăti în plus." />
				</h2>
				<Reveal delay={200}>
					<p className="mx-auto mt-8 max-w-xl text-pretty text-[0.7rem] text-muted-foreground uppercase leading-loose tracking-[0.26em] sm:text-xs">
						Caută gratuit, fără cont. Creează un cont ca să setezi prețuri țintă
						și să primești alerte în aplicație.
					</p>
					<div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5">
						<TerminalLink
							className="w-full sm:w-auto"
							href="/cauta"
							label="Caută un produs"
						/>
						<AccountLink className="w-full sm:w-auto" />
					</div>
				</Reveal>
			</div>
		</section>
	);
}

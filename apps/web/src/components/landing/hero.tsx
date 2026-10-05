import { Reveal } from "@/components/motion/reveal";
import { ScrambleText } from "@/components/motion/scramble-text";
import { HeroSearchForm } from "@/components/search/hero-search-form";
import { BRAND } from "@/lib/brand";

import { HeroBackdrop } from "./hero-backdrop";
import { PricePreview } from "./price-preview";
import { AccountLink, TerminalLink } from "./terminal-link";

/** "Același produs." / "Prețul cel mai mic." - one line per sentence. */
const HEADLINE = BRAND.tagline.split(/(?<=\.)\s+/);

const STATS = [
	{ label: "magazine comparate", value: "03" },
	{ label: "potrivire după cod", value: "EAN" },
	{ label: "căutare fără cont", value: "0 lei" },
] as const;

/**
 * Always-dark cinematic hero (the `dark` class switches the design tokens for this subtree,
 * whatever the site theme). It slides under the transparent sticky header (65px).
 */
export function Hero() {
	return (
		<section
			aria-labelledby="hero-title"
			className="arbitra-stage dark relative isolate -mt-[65px] overflow-hidden pt-[65px] text-foreground"
		>
			<HeroBackdrop />

			<div className="relative mx-auto flex min-h-[calc(100svh-65px)] w-full max-w-7xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6 sm:py-20">
				<Reveal trigger="intro">
					<p className="flex items-center justify-center gap-3 font-mono text-[0.62rem] text-primary uppercase tracking-[0.4em] sm:text-[0.68rem]">
						<span
							aria-hidden="true"
							className="h-px w-6 bg-primary/60 sm:w-10"
						/>
						Comparator de prețuri
						<span
							aria-hidden="true"
							className="h-px w-6 bg-primary/60 sm:w-10"
						/>
					</p>
				</Reveal>

				<h1
					className="mt-8 font-semibold text-[clamp(2rem,6vw,5rem)] uppercase leading-[1.04] tracking-[0.08em] sm:mt-10"
					id="hero-title"
				>
					{HEADLINE.map((line, index) => (
						<ScrambleText
							className={index === 0 ? "block" : "block text-primary"}
							delay={index * 420}
							key={line}
							start="intro"
							text={line}
						/>
					))}
				</h1>

				<Reveal className="mt-8 max-w-2xl sm:mt-10" delay={500} trigger="intro">
					<p className="text-pretty text-[0.7rem] text-muted-foreground uppercase leading-relaxed tracking-[0.26em] sm:text-xs sm:leading-loose">
						Compară același produs în eMAG, PC Garage și Altex, vezi istoricul
						prețului și primești alertă în aplicație când ajunge la ținta ta.
					</p>
				</Reveal>

				<Reveal className="mt-10 w-full max-w-xl" delay={750} trigger="intro">
					<div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left shadow-2xl shadow-black/40 backdrop-blur-md sm:p-5 [&_form]:mt-0 [&_form]:max-w-none [&_label]:font-mono [&_label]:text-[0.62rem] [&_label]:text-muted-foreground [&_label]:uppercase [&_label]:tracking-[0.3em]">
						<HeroSearchForm />
					</div>
				</Reveal>

				<Reveal
					className="mt-8 flex w-full flex-col items-center justify-center gap-4 sm:w-auto sm:flex-row sm:gap-5"
					delay={950}
					trigger="intro"
				>
					<TerminalLink
						className="w-full sm:w-auto"
						href="/cauta"
						label="Caută un produs"
					/>
					<AccountLink className="w-full sm:w-auto" />
				</Reveal>

				<a
					className="mt-14 flex flex-col items-center gap-3 rounded-md font-mono text-[0.6rem] text-muted-foreground uppercase tracking-[0.4em] outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-sm:hidden"
					href="#cum-arata"
				>
					Derulează
					<span
						aria-hidden="true"
						className="relative h-10 w-px overflow-hidden bg-white/10"
					>
						<span className="absolute inset-0 animate-[arbitra-scroll-cue_2.4s_cubic-bezier(0.76,0,0.24,1)_infinite] bg-primary motion-reduce:animate-none" />
					</span>
				</a>
			</div>

			<div
				className="relative mx-auto grid w-full max-w-6xl items-center gap-16 px-4 pt-8 pb-28 sm:px-6 sm:pb-32 lg:grid-cols-2 lg:gap-20"
				id="cum-arata"
			>
				<Reveal>
					<p className="font-mono text-[0.62rem] text-primary uppercase tracking-[0.4em]">
						[ 00 ] Prețul în timp real
					</p>
					<h2 className="mt-5 font-medium text-3xl uppercase leading-tight tracking-[0.06em] sm:text-4xl">
						Vezi exact când merită să cumperi
					</h2>
					<p className="mt-5 max-w-md text-pretty text-base text-muted-foreground leading-relaxed">
						Alegi prețul țintă, iar {BRAND.name} urmărește produsul în toate
						magazinele. Când prețul ajunge la țintă sau scade sub ea, primești
						alerta în aplicație. Tu decizi dacă și de unde cumperi.
					</p>
					<dl className="mt-10 grid max-w-md grid-cols-3 border-white/10 border-t">
						{STATS.map(({ value, label }) => (
							<div
								className="flex flex-col-reverse justify-end border-white/10 border-r pt-5 pr-3 last:border-r-0 [&:not(:first-child)]:pl-4"
								key={label}
							>
								<dt className="mt-1 text-[0.62rem] text-muted-foreground uppercase leading-snug tracking-[0.2em]">
									{label}
								</dt>
								<dd className="font-light font-mono text-2xl text-foreground sm:text-3xl">
									{value}
								</dd>
							</div>
						))}
					</dl>
				</Reveal>
				<PricePreview />
			</div>
		</section>
	);
}

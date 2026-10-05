import { cn } from "@my-better-t-app/ui/lib/utils";
import {
	BellRing,
	ChartLine,
	type LucideIcon,
	Puzzle,
	Scale,
	ShoppingCart,
} from "lucide-react";

import { Reveal } from "@/components/motion/reveal";

import { SectionHeading } from "./section-heading";

interface Feature {
	description: string;
	icon: LucideIcon;
	/** Grid placement on large screens: the first two are wide, the rest share a row. */
	span: string;
	title: string;
}

const FEATURES: readonly Feature[] = [
	{
		description:
			"Recunoaștem același produs în eMAG, PC Garage și Altex după codul EAN sau codul de model, ca să compari exact același lucru, nu doar un nume asemănător.",
		icon: Scale,
		span: "lg:col-span-3",
		title: "Comparare între magazine",
	},
	{
		description:
			"Vezi cum a evoluat prețul în timp și cât de recent a fost verificat fiecare preț, ca să știi dacă oferta de azi chiar merită.",
		icon: ChartLine,
		span: "lg:col-span-3",
		title: "Istoric de prețuri, cu prospețime",
	},
	{
		description:
			"Setezi prețul țintă, iar noi urmărim produsul. Când prețul ajunge la țintă sau scade sub ea, primești alerta în aplicație.",
		icon: BellRing,
		span: "lg:col-span-2",
		title: "Alerte de preț în aplicație",
	},
	{
		description:
			"Împărțim coșul între magazine astfel încât totalul să fie cel mai mic, cu transportul inclus în calcul.",
		icon: ShoppingCart,
		span: "lg:col-span-2",
		title: "Coș optimizat între magazine",
	},
	{
		description:
			"Pe pagina unui produs din eMAG, PC Garage sau Altex, extensia îți arată pe loc dacă îl găsești mai ieftin în altă parte.",
		icon: Puzzle,
		span: "md:col-span-2 lg:col-span-2",
		title: "Extensie de browser",
	},
];

export function Features() {
	return (
		<section
			aria-labelledby="features-title"
			className="relative overflow-hidden px-4 py-24 sm:px-6 sm:py-32"
			id="functii"
		>
			<div className="mx-auto max-w-6xl">
				<SectionHeading
					description="Compari, urmărești și primești alerta. Decizia de cumpărare rămâne mereu a ta."
					eyebrow="Funcții"
					id="features-title"
					index="01"
					title="Tot ce îți trebuie ca să cumperi la momentul potrivit"
				/>
				<ul className="mt-16 grid gap-px overflow-hidden rounded-2xl border bg-border sm:mt-20 md:grid-cols-2 lg:grid-cols-6">
					{FEATURES.map(({ icon: Icon, title, description, span }, index) => (
						<li
							className={cn("group relative bg-background", span)}
							key={title}
						>
							<div
								aria-hidden="true"
								className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_70%_at_0%_0%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent)] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
							/>
							<Reveal
								className="relative h-full p-7 sm:p-9"
								delay={(index % 3) * 110}
							>
								<div className="flex items-center justify-between gap-3">
									<span className="font-mono text-[0.65rem] text-muted-foreground tracking-[0.3em]">
										{String(index + 1).padStart(2, "0")}
									</span>
									<span className="flex size-11 items-center justify-center rounded-full border text-primary transition-transform duration-500 group-hover:-rotate-12 group-hover:scale-110">
										<Icon aria-hidden="true" className="size-5" />
									</span>
								</div>
								<h3 className="mt-10 font-medium text-xl tracking-tight sm:mt-14">
									{title}
								</h3>
								<p className="mt-3 max-w-md text-pretty text-muted-foreground text-sm/relaxed">
									{description}
								</p>
							</Reveal>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}

import { Reveal } from "@/components/motion/reveal";

import { SectionHeading } from "./section-heading";

const STEPS = [
	{
		description:
			"Scrii numele produsului și găsim aceeași ofertă în eMAG, PC Garage și Altex, potrivită după EAN sau cod de model.",
		title: "Cauți produsul",
	},
	{
		description:
			"Adaugi produsul în coș și setezi prețul la care merită să-l cumperi. Istoricul te ajută să alegi o țintă realistă.",
		title: "Îți alegi prețul țintă",
	},
	{
		description:
			"Urmărim prețurile pentru tine. Când prețul ajunge la țintă sau scade sub ea, te anunțăm în aplicație, iar tu decizi de unde cumperi.",
		title: "Primești alerta",
	},
] as const;

export function HowItWorks() {
	return (
		<section
			aria-labelledby="how-title"
			className="border-y bg-muted/40 px-4 py-24 sm:px-6 sm:py-32"
			id="cum-functioneaza"
		>
			<div className="mx-auto max-w-6xl">
				<SectionHeading
					description="Nu mai verifici prețurile zi de zi. Le urmărim noi și îți spunem când e momentul."
					eyebrow="Cum funcționează"
					id="how-title"
					index="02"
					title="Trei pași, fără tab-uri deschise"
				/>
				<ol className="mt-16 grid gap-12 sm:mt-20 md:grid-cols-3 md:gap-10">
					{STEPS.map(({ title, description }, index) => (
						<li key={title}>
							<Reveal delay={index * 140}>
								<div className="flex items-end gap-5">
									<span
										aria-hidden="true"
										className="font-extralight font-mono text-6xl text-primary tabular-nums leading-none sm:text-7xl"
									>
										{String(index + 1).padStart(2, "0")}
									</span>
									<span
										aria-hidden="true"
										className="mb-3 h-px flex-1 bg-border"
									/>
								</div>
								<h3 className="mt-8 font-medium text-xl tracking-tight">
									<span className="sr-only">{`Pasul ${index + 1}: `}</span>
									{title}
								</h3>
								<p className="mt-3 text-pretty text-muted-foreground text-sm/relaxed">
									{description}
								</p>
							</Reveal>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}

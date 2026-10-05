import { Reveal } from "@/components/motion/reveal";

/** Editorial section heading: mono index + eyebrow, light large title, quiet description. */
export function SectionHeading({
	id,
	index,
	eyebrow,
	title,
	description,
}: {
	id: string;
	index: string;
	eyebrow: string;
	title: string;
	description: string;
}) {
	return (
		<Reveal className="mx-auto max-w-3xl text-center">
			<p className="font-mono text-[0.65rem] text-primary uppercase tracking-[0.4em]">
				<span aria-hidden="true">[ {index} ] </span>
				{eyebrow}
			</p>
			<h2
				className="mt-5 font-medium text-3xl tracking-[-0.02em] sm:text-5xl sm:leading-[1.08]"
				id={id}
			>
				{title}
			</h2>
			<p className="mx-auto mt-5 max-w-xl text-pretty text-base text-muted-foreground leading-relaxed">
				{description}
			</p>
		</Reveal>
	);
}

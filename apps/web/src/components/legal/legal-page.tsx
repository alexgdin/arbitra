import { cn } from "@my-better-t-app/ui/lib/utils";
import { Info } from "lucide-react";
import Link from "next/link";

export const LEGAL_LAST_UPDATED = "5 octombrie 2026";
export const LEGAL_LAST_UPDATED_ISO = "2026-10-05";

/** Operatorul și adresa de contact, afișate în toate paginile legale. */
export const OPERATOR_PLACEHOLDER = "Hrongobar";
export const CONTACT_PLACEHOLDER = "hrongobar@gmail.com";

const LEGAL_LINKS = [
	{ href: "/termeni", label: "Termeni și condiții" },
	{ href: "/confidentialitate", label: "Confidențialitate" },
	{ href: "/cookies", label: "Cookie-uri" },
] as const;

type LegalHref = (typeof LEGAL_LINKS)[number]["href"];

export function Placeholder({ children }: { children: React.ReactNode }) {
	return (
		<span className="font-medium text-foreground">{children}</span>
	);
}

export function LegalSection({
	id,
	title,
	children,
}: {
	id: string;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section aria-labelledby={id} className="scroll-mt-24 space-y-3">
			<h2
				className="font-semibold text-foreground text-xl tracking-tight"
				id={id}
			>
				{title}
			</h2>
			{children}
		</section>
	);
}

export function LegalPage({
	current,
	title,
	intro,
	children,
}: {
	current: LegalHref;
	title: string;
	intro: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<article className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
			<nav aria-label="Documente legale" className="mb-8">
				<ul className="flex flex-wrap gap-2">
					{LEGAL_LINKS.map(({ href, label }) => {
						const active = href === current;
						return (
							<li key={href}>
								<Link
									aria-current={active ? "page" : undefined}
									className={cn(
										"inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
										active
											? "border-primary/40 bg-primary/10 font-medium text-foreground"
											: "text-muted-foreground hover:border-foreground/30 hover:text-foreground"
									)}
									href={href}
								>
									{label}
								</Link>
							</li>
						);
					})}
				</ul>
			</nav>

			<header className="motion-safe:fade-in motion-safe:slide-in-from-bottom-2 space-y-3 motion-safe:animate-in motion-safe:duration-500">
				<h1 className="text-balance font-semibold text-3xl tracking-tight sm:text-4xl">
					{title}
				</h1>
				<p className="text-muted-foreground text-sm">
					Ultima actualizare:{" "}
					<time dateTime={LEGAL_LAST_UPDATED_ISO}>{LEGAL_LAST_UPDATED}</time>
				</p>
				<div className="text-pretty text-base text-muted-foreground leading-relaxed">
					{intro}
				</div>
			</header>

			<aside
				aria-label="Notă despre prototip"
				className="mt-8 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm"
			>
				<Info
					aria-hidden="true"
					className="mt-0.5 size-4 shrink-0 text-warning"
				/>
				<p className="text-pretty">
					Arbitra este un prototip realizat la un hackathon de echipa{" "}
					{OPERATOR_PLACEHOLDER}, nu un serviciu comercial lansat. Pentru orice
					întrebare ne poți scrie la {CONTACT_PLACEHOLDER}.
				</p>
			</aside>

			<div className="mt-10 space-y-10 text-pretty text-base leading-relaxed [&_a:focus-visible]:ring-2 [&_a:focus-visible]:ring-ring [&_a]:rounded-sm [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:outline-none [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6 [&_ul]:marker:text-muted-foreground">
				{children}
			</div>
		</article>
	);
}

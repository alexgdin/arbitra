"use client";

import { Button } from "@my-better-t-app/ui/components/button";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { Cookie } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

export const COOKIE_CONSENT_KEY = "arbitra:cookie-consent";
const CONSENT_VERSION = 1;
const OPEN_EVENT = "arbitra:open-cookie-settings";

type Choice = "all" | "necessary";
type StoredConsent = { choice: Choice; at: string; version: number };

const CHOICE_LABEL: Record<Choice, string> = {
	all: "Accept toate",
	necessary: "Doar necesare",
};

function readConsent(): StoredConsent | null {
	try {
		const raw = window.localStorage.getItem(COOKIE_CONSENT_KEY);
		if (!raw) {
			return null;
		}
		const parsed = JSON.parse(raw) as Partial<StoredConsent> | null;
		if (
			parsed &&
			(parsed.choice === "all" || parsed.choice === "necessary") &&
			typeof parsed.at === "string" &&
			parsed.version === CONSENT_VERSION
		) {
			return { at: parsed.at, choice: parsed.choice, version: parsed.version };
		}
	} catch {
		// stocare blocată (mod privat) sau valoare coruptă: întrebăm din nou
	}
	return null;
}

function writeConsent(choice: Choice): StoredConsent {
	const consent: StoredConsent = {
		at: new Date().toISOString(),
		choice,
		version: CONSENT_VERSION,
	};
	try {
		window.localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
	} catch {
		// fără stocare, alegerea rămâne valabilă doar pentru pagina curentă
	}
	return consent;
}

/** Redeschide bannerul de cookie-uri (de exemplu din subsolul paginii). */
export function openCookieSettings() {
	window.dispatchEvent(new Event(OPEN_EVENT));
}

export function CookieSettingsButton({ className }: { className?: string }) {
	return (
		<button className={className} onClick={openCookieSettings} type="button">
			Setări cookie-uri
		</button>
	);
}

export default function CookieConsent() {
	const [open, setOpen] = useState(false);
	const [current, setCurrent] = useState<Choice | null>(null);
	const regionRef = useRef<HTMLElement>(null);
	const returnFocusRef = useRef<HTMLElement | null>(null);
	const titleId = useId();
	const descriptionId = useId();

	// Decizia se ia doar în browser, după hidratare: serverul nu știe ce e în localStorage.
	useEffect(() => {
		const stored = readConsent();
		setCurrent(stored?.choice ?? null);
		if (!stored) {
			setOpen(true);
		}

		function handleOpen() {
			returnFocusRef.current =
				document.activeElement instanceof HTMLElement
					? document.activeElement
					: null;
			setCurrent(readConsent()?.choice ?? null);
			setOpen(true);
			requestAnimationFrame(() => regionRef.current?.focus());
		}

		window.addEventListener(OPEN_EVENT, handleOpen);
		return () => window.removeEventListener(OPEN_EVENT, handleOpen);
	}, []);

	// Cât timp bannerul e vizibil, pagina primește spațiu jos, ca să poți derula tot conținutul deasupra lui.
	useEffect(() => {
		const region = regionRef.current;
		if (!(open && region)) {
			return;
		}
		const body = document.body;
		const previous = body.style.paddingBottom;
		const apply = () => {
			body.style.paddingBottom = `${region.offsetHeight + 16}px`;
		};
		apply();
		const observer = new ResizeObserver(apply);
		observer.observe(region);
		return () => {
			observer.disconnect();
			body.style.paddingBottom = previous;
		};
	}, [open]);

	function choose(choice: Choice) {
		writeConsent(choice);
		setCurrent(choice);
		setOpen(false);
		const target = returnFocusRef.current;
		returnFocusRef.current = null;
		if (target?.isConnected) {
			requestAnimationFrame(() => target.focus());
		}
	}

	if (!open) {
		return null;
	}

	return (
		<section
			aria-describedby={descriptionId}
			aria-labelledby={titleId}
			className={cn(
				"group fixed inset-x-0 bottom-0 z-50 px-3 pb-3 outline-none sm:px-4 sm:pb-4",
				"motion-safe:fade-in motion-safe:slide-in-from-bottom-8 motion-safe:animate-in motion-safe:duration-500 motion-safe:ease-out"
			)}
			ref={regionRef}
			tabIndex={-1}
		>
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-4 rounded-2xl border bg-card/95 p-4 text-card-foreground shadow-2xl ring-1 ring-black/5 backdrop-blur-md group-focus-visible:ring-2 group-focus-visible:ring-ring sm:p-5 md:flex-row md:items-center md:gap-6">
				<div className="flex min-w-0 flex-1 items-start gap-3">
					<span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<Cookie aria-hidden="true" className="size-5" />
					</span>
					<div className="min-w-0 space-y-1">
						<h2 className="font-semibold text-base tracking-tight" id={titleId}>
							Cookie-uri și stocare locală
						</h2>
						<p
							className="text-pretty text-muted-foreground text-sm"
							id={descriptionId}
						>
							{
								"Arbitra folosește doar cookie-uri necesare (sesiunea de autentificare) și stocare locală pentru preferințe (temă, notificări citite); nu folosim cookie-uri de publicitate sau de analiză. "
							}
							<Link
								className="rounded-sm font-medium text-foreground underline underline-offset-4 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
								href="/cookies"
							>
								Politica de cookie-uri
							</Link>
						</p>
						{current ? (
							<p className="text-muted-foreground text-xs">
								Alegerea ta actuală:{" "}
								<span className="font-medium">{CHOICE_LABEL[current]}</span>
							</p>
						) : null}
					</div>
				</div>
				<div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
					<Button
						onClick={() => choose("necessary")}
						type="button"
						variant="outline"
					>
						Doar necesare
					</Button>
					<Button onClick={() => choose("all")} type="button">
						Accept toate
					</Button>
				</div>
			</div>
		</section>
	);
}

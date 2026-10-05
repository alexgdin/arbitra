import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@my-better-t-app/ui/components/table";
import type { Metadata } from "next";
import Link from "next/link";

import { CookieSettingsButton } from "@/components/cookie-consent";
import {
	CONTACT_PLACEHOLDER,
	LegalPage,
	LegalSection,
	Placeholder,
} from "@/components/legal/legal-page";

export const metadata: Metadata = {
	description:
		"Ce cookie-uri și ce chei de stocare locală folosește Arbitra. Fără cookie-uri de publicitate, de analiză sau de la terți.",
	title: "Politica de cookie-uri",
};

type StorageRow = {
	name: string;
	kind: string;
	purpose: string;
	duration: string;
};

const COOKIES: StorageRow[] = [
	{
		duration: "Până la deconectare sau expirarea sesiunii (implicit 7 zile)",
		kind: "Cookie necesar (HttpOnly, Secure), primă parte",
		name: "better-auth.session_token",
		purpose:
			"Te ține conectat în contul Arbitra după autentificare. Fără el nu poți folosi coșul, alertele sau extensia. În producție poate avea prefixul __Secure-.",
	},
];

const LOCAL_STORAGE: StorageRow[] = [
	{
		duration: "Până o ștergi din browser sau o schimbi din „Setări cookie-uri”",
		kind: "localStorage",
		name: "arbitra:cookie-consent",
		purpose:
			"Ține minte alegerea ta din bannerul de cookie-uri, ca să nu te întrebăm la fiecare vizită.",
	},
	{
		duration: "Până o ștergi din browser",
		kind: "localStorage",
		name: "theme",
		purpose: "Tema aleasă: luminoasă, întunecată sau cea a sistemului.",
	},
	{
		duration: "Până o ștergi din browser",
		kind: "localStorage",
		name: "arbitra:notifications:read",
		purpose:
			"Alertele de preț pe care le-ai marcat ca citite, ca să nu apară din nou ca noi.",
	},
	{
		duration: "Până închizi fila sau browserul",
		kind: "sessionStorage",
		name: "arbitra:intro-seen",
		purpose:
			"Animația de intro a paginii de pornire se arată o singură dată pe sesiune.",
	},
];

function StorageTable({
	caption,
	rows,
}: {
	caption: string;
	rows: StorageRow[];
}) {
	return (
		<div className="rounded-xl border">
			<Table>
				<TableCaption className="sr-only">{caption}</TableCaption>
				<TableHeader>
					<TableRow>
						<TableHead scope="col">Nume</TableHead>
						<TableHead scope="col">Tip</TableHead>
						<TableHead scope="col">La ce folosește</TableHead>
						<TableHead scope="col">Cât durează</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<TableRow className="align-top" key={row.name}>
							<TableCell className="whitespace-nowrap font-mono text-xs">
								{row.name}
							</TableCell>
							<TableCell className="min-w-36 whitespace-normal text-sm">
								{row.kind}
							</TableCell>
							<TableCell className="min-w-64 whitespace-normal text-sm">
								{row.purpose}
							</TableCell>
							<TableCell className="min-w-40 whitespace-normal text-sm">
								{row.duration}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

export default function CookiesPage() {
	return (
		<LegalPage
			current="/cookies"
			intro={
				<p>
					Arbitra folosește un singur cookie, cel de sesiune, necesar ca să
					rămâi conectat, și câteva chei de stocare locală pentru preferințe. Nu
					folosim cookie-uri de publicitate, de analiză sau de la terți.
				</p>
			}
			title="Politica de cookie-uri"
		>
			<LegalSection
				id="ce-sunt"
				title="1. Ce sunt cookie-urile și stocarea locală"
			>
				<p>
					Cookie-urile sunt fișiere mici pe care un site le salvează în
					browserul tău și pe care browserul le trimite înapoi la fiecare
					cerere. Stocarea locală (localStorage și sessionStorage) păstrează
					date doar în browserul tău; ele nu sunt trimise automat către serverul
					nostru.
				</p>
			</LegalSection>

			<LegalSection id="cookie-uri" title="2. Cookie-urile pe care le folosim">
				<StorageTable
					caption="Cookie-urile folosite de Arbitra"
					rows={COOKIES}
				/>
				<p className="text-muted-foreground text-sm">
					Cookie-ul este setat de serverul Arbitra doar după ce te autentifici.
					Nu există cookie-uri terțe: nu încărcăm scripturi de reclame, de
					analiză sau rețele sociale.
				</p>
			</LegalSection>

			<LegalSection id="stocare-locala" title="3. Stocarea locală din browser">
				<StorageTable
					caption="Cheile de stocare locală folosite de Arbitra"
					rows={LOCAL_STORAGE}
				/>
			</LegalSection>

			<LegalSection id="alegerea-ta" title="4. Alegerea ta">
				<p>
					La prima vizită te întrebăm dacă accepți toate cookie-urile sau doar
					pe cele necesare. În acest moment Arbitra nu folosește cookie-uri
					opționale, deci cele două opțiuni au același efect; dacă vom adăuga
					vreodată ceva opțional, îl vom activa doar dacă ai ales „Accept toate”
					și vom actualiza această pagină.
				</p>
				<p>
					Îți poți schimba oricând alegerea:{" "}
					<CookieSettingsButton className="rounded-sm font-medium text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
					. Poți șterge cookie-urile și stocarea locală și din setările
					browserului; dacă ștergi cookie-ul de sesiune, vei fi deconectat.
				</p>
			</LegalSection>

			<LegalSection id="contact" title="5. Întrebări">
				<p>
					Pentru întrebări ne scrii la{" "}
					<Placeholder>{CONTACT_PLACEHOLDER}</Placeholder>. Despre datele
					contului afli mai multe în{" "}
					<Link href="/confidentialitate">Politica de confidențialitate</Link>.
				</p>
			</LegalSection>
		</LegalPage>
	);
}

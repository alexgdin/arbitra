import type { Metadata } from "next";
import Link from "next/link";

import {
	CONTACT_PLACEHOLDER,
	LegalPage,
	LegalSection,
	OPERATOR_PLACEHOLDER,
	Placeholder,
} from "@/components/legal/legal-page";

export const metadata: Metadata = {
	description:
		"Termenii și condițiile de utilizare a prototipului Arbitra: ce oferă serviciul, prețuri informative, contul și limitarea răspunderii.",
	title: "Termeni și condiții",
};

export default function TermsPage() {
	return (
		<LegalPage
			current="/termeni"
			intro={
				<p>
					Acești termeni descriu regulile de folosire a Arbitra, aplicația care
					compară prețul aceluiași produs în eMAG, PC Garage și Altex. Când îți
					creezi un cont, confirmi că i-ai citit și că ești de acord cu ei.
				</p>
			}
			title="Termeni și condiții"
		>
			<LegalSection id="operator" title="1. Cine operează serviciul">
				<p>
					Arbitra este un prototip realizat la un hackathon și este operat de{" "}
					<Placeholder>{OPERATOR_PLACEHOLDER}</Placeholder>. Ne poți scrie la{" "}
					<Placeholder>{CONTACT_PLACEHOLDER}</Placeholder>.
				</p>
			</LegalSection>

			<LegalSection id="serviciu" title="2. Ce oferă serviciul">
				<ul>
					<li>
						căutarea unui produs și compararea ofertelor din eMAG, PC Garage și
						Altex;
					</li>
					<li>
						istoricul prețului pentru produsele pe care le avem în baza de date;
					</li>
					<li>
						un coș în care îți pui produsele urmărite, cu prețuri țintă și
						sugestii despre magazinul în care coșul costă cel mai puțin;
					</li>
					<li>
						alerte în aplicație când prețul ajunge la ținta ta sau scade sub ea.
						Arbitra nu cumpără nimic în locul tău: decizia și comanda îți
						aparțin, pe site-ul magazinului;
					</li>
					<li>
						o extensie de browser care citește prețul de pe pagina de produs pe
						care o vizitezi.
					</li>
				</ul>
				<p>
					Serviciul este gratuit. Fiind un prototip, poate fi oprit sau
					modificat oricând.
				</p>
			</LegalSection>

			<LegalSection id="preturi" title="3. Prețurile sunt informative">
				<p>
					Prețurile, stocul și ofertele afișate sunt preluate periodic de pe
					site-urile magazinelor și pot fi depășite în momentul în care le vezi.
					Pentru fiecare ofertă afișăm data ultimei verificări. Prețul valabil
					este întotdeauna cel de pe site-ul magazinului, în momentul comenzii.
					Nu garantăm că un preț afișat în Arbitra va fi onorat de magazin.
				</p>
			</LegalSection>

			<LegalSection id="afiliere" title="4. Nu suntem afiliați cu magazinele">
				<p>
					Arbitra nu este afiliat, sponsorizat sau aprobat de eMAG, PC Garage
					sau Altex. Numele magazinelor și ale produselor aparțin proprietarilor
					lor și sunt folosite doar ca să identificăm ofertele. Linkurile către
					magazine duc pe site-urile lor oficiale, unde se aplică termenii
					fiecărui magazin.
				</p>
			</LegalSection>

			<LegalSection id="extensie" title="5. Contribuțiile prin extensie">
				<p>
					Când folosești extensia Arbitra pe o pagină de produs, ea trimite în
					contul tău datele publice ale produsului (titlu, preț, stoc, coduri de
					produs, adresa paginii). Te rugăm să nu modifici aceste date și să nu
					trimiți date false sau automatizate. Putem respinge sau șterge
					contribuțiile care par incorecte și putem suspenda conturile care le
					trimit în mod repetat.
				</p>
			</LegalSection>

			<LegalSection id="cont" title="6. Contul tău">
				<ul>
					<li>trebuie să ai cel puțin 16 ani ca să-ți creezi un cont;</li>
					<li>
						datele din cont trebuie să fie reale, iar parola trebuie păstrată în
						siguranță;
					</li>
					<li>ești responsabil pentru activitatea din contul tău;</li>
					<li>
						poți cere oricând ștergerea contului, la{" "}
						<Placeholder>{CONTACT_PLACEHOLDER}</Placeholder>; datele tale sunt
						tratate conform{" "}
						<Link href="/confidentialitate">
							Politicii de confidențialitate
						</Link>
						.
					</li>
				</ul>
			</LegalSection>

			<LegalSection id="raspundere" title="7. Limitarea răspunderii">
				<p>
					Serviciul este oferit „așa cum este”, fără garanții de disponibilitate
					sau de exactitate a datelor. În limitele permise de lege, nu răspundem
					pentru pierderi rezultate din decizii de cumpărare luate pe baza
					informațiilor din Arbitra, din prețuri depășite sau din
					indisponibilitatea temporară a serviciului. Nimic din acești termeni
					nu îți limitează drepturile de consumator prevăzute de lege.
				</p>
			</LegalSection>

			<LegalSection id="modificari" title="8. Modificări">
				<p>
					Putem actualiza acești termeni. Data ultimei actualizări apare la
					începutul paginii. Dacă schimbările sunt importante, te anunțăm în
					aplicație înainte să intre în vigoare.
				</p>
			</LegalSection>

			<LegalSection id="lege" title="9. Legea aplicabilă">
				<p>
					Acești termeni sunt guvernați de legea română. Orice neînțelegere o
					rezolvăm mai întâi pe cale amiabilă; dacă nu reușim, competența
					aparține instanțelor din România. Ca consumator, te poți adresa și
					Autorității Naționale pentru Protecția Consumatorilor (
					<a href="https://anpc.ro/" rel="noopener noreferrer" target="_blank">
						anpc.ro
					</a>
					).
				</p>
			</LegalSection>
		</LegalPage>
	);
}

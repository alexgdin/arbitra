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
		"Ce date personale colectează Arbitra, de ce, cât timp le păstrăm și ce drepturi ai conform GDPR.",
	title: "Politica de confidențialitate",
};

export default function PrivacyPage() {
	return (
		<LegalPage
			current="/confidentialitate"
			intro={
				<p>
					Colectăm doar datele de care avem nevoie ca să-ți arătăm prețurile și
					să te anunțăm când scad. Nu vindem date, nu afișăm reclame și nu
					folosim instrumente de analiză sau de urmărire. Politica respectă
					Regulamentul (UE) 2016/679 (GDPR).
				</p>
			}
			title="Politica de confidențialitate"
		>
			<LegalSection id="operator" title="1. Operatorul datelor">
				<p>
					Operatorul datelor este{" "}
					<Placeholder>{OPERATOR_PLACEHOLDER}</Placeholder>, echipa care a
					realizat prototipul Arbitra. Pentru orice întrebare despre datele tale
					ne scrii la <Placeholder>{CONTACT_PLACEHOLDER}</Placeholder>.
				</p>
			</LegalSection>

			<LegalSection id="date" title="2. Ce date colectăm">
				<ul>
					<li>
						<strong>Datele contului:</strong> numele și adresa de email. Parola
						nu este stocată ca atare, ci doar ca hash criptografic, din care nu
						poate fi recuperată.
					</li>
					<li>
						<strong>Sesiunea de autentificare:</strong> un cookie de sesiune și,
						pe server, data creării sesiunii, adresa IP și tipul de browser, ca
						să te ținem conectat în siguranță.
					</li>
					<li>
						<strong>Produsele urmărite:</strong> produsele din coș, cantitățile,
						prețurile țintă și alertele de preț generate pentru tine.
					</li>
					<li>
						<strong>Preferințe locale:</strong> tema, notificările citite și
						alegerea privind cookie-urile rămân în browserul tău (stocare
						locală) și nu ajung la noi. Detalii în{" "}
						<Link href="/cookies">Politica de cookie-uri</Link>.
					</li>
				</ul>
			</LegalSection>

			<LegalSection id="extensie" title="3. Ce trimite extensia de browser">
				<p>
					Extensia Arbitra rulează doar pe site-urile eMAG, PC Garage și Altex,
					citește doar paginile de produs și trimite date doar când ești
					conectat în contul tău Arbitra. Trimite exclusiv date publice de
					produs: titlul, prețul, stocul, codurile de produs (EAN, cod de
					model), imaginea și adresa paginii. Nu citește istoricul de navigare,
					alte site-uri, coșul tău din magazin sau datele contului tău de la
					magazin.
				</p>
			</LegalSection>

			<LegalSection id="temei" title="4. De ce folosim datele și temeiul legal">
				<ul>
					<li>
						contul, sesiunea, coșul și alertele de preț: ca să îți oferim
						serviciul pe care l-ai cerut (executarea contractului, art. 6 alin.
						1 lit. b GDPR);
					</li>
					<li>
						datele tehnice ale sesiunii și protecția împotriva abuzurilor:
						interesul nostru legitim de a ține serviciul sigur (art. 6 alin. 1
						lit. f GDPR);
					</li>
					<li>
						prețurile trimise prin extensie: îmbunătățirea comparațiilor pentru
						toți utilizatorii, pe baza contribuției tale voluntare.
					</li>
				</ul>
			</LegalSection>

			<LegalSection id="pastrare" title="5. Cât timp păstrăm datele">
				<ul>
					<li>
						datele contului, coșul și alertele: cât timp ai cont, apoi le
						ștergem;
					</li>
					<li>sesiunile: până la deconectare sau expirarea sesiunii;</li>
					<li>
						prețurile de produs (inclusiv cele trimise prin extensie) nu sunt
						date personale și pot rămâne în istoricul de prețuri după ștergerea
						contului, fără legătură cu tine.
					</li>
				</ul>
			</LegalSection>

			<LegalSection id="destinatari" title="6. Cui transmitem datele">
				<p>
					Nu vindem și nu închiriem datele tale. Le folosim doar furnizorii
					tehnici de care avem nevoie ca să funcționeze serviciul (găzduirea
					aplicației și a bazei de date), în baza unor contracte care îi obligă
					să le protejeze. Magazinele comparate nu primesc date despre tine de
					la noi.
				</p>
			</LegalSection>

			<LegalSection id="drepturi" title="7. Drepturile tale">
				<p>Conform GDPR, ai dreptul:</p>
				<ul>
					<li>
						să afli ce date avem despre tine și să primești o copie (acces);
					</li>
					<li>să ceri corectarea datelor greșite (rectificare);</li>
					<li>să ceri ștergerea contului și a datelor (ștergere);</li>
					<li>să ceri restricționarea prelucrării sau să te opui ei;</li>
					<li>să primești datele într-un format structurat (portabilitate).</li>
				</ul>
				<p>
					Pentru oricare dintre ele, scrie-ne la{" "}
					<Placeholder>{CONTACT_PLACEHOLDER}</Placeholder>. Îți răspundem în cel
					mult o lună.
				</p>
			</LegalSection>

			<LegalSection id="anspdcp" title="8. Plângeri">
				<p>
					Dacă ești nemulțumit de felul în care îți prelucrăm datele, poți
					depune o plângere la Autoritatea Națională de Supraveghere a
					Prelucrării Datelor cu Caracter Personal (ANSPDCP),{" "}
					<a
						href="https://www.dataprotection.ro/"
						rel="noopener noreferrer"
						target="_blank"
					>
						dataprotection.ro
					</a>
					.
				</p>
			</LegalSection>

			<LegalSection id="modificari" title="9. Modificări">
				<p>
					Dacă schimbăm această politică, actualizăm data de la începutul
					paginii și te anunțăm în aplicație când schimbările sunt importante.
				</p>
			</LegalSection>
		</LegalPage>
	);
}

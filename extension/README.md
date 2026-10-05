# Extensia Arbitra (Chrome)

Extensie Manifest V3, în JavaScript simplu: fără build, fără dependențe npm, fără framework. Folderul `extension/` nu face parte din workspace-urile Bun ale monorepo-ului; se încarcă în Chrome direct din sursă.

## Ce face

Pe pagina unui produs de pe **eMAG**, **PC Garage** sau **Altex**, extensia:

1. **Citește produsul și prețul** din datele structurate ale paginii (JSON-LD `Product`), cu textul prețului din pagină ca rezervă.
2. **Trimite prețul la API-ul Arbitra**, doar dacă ești conectat în Arbitra. Așa istoricul de prețuri se actualizează din contribuțiile utilizatorilor (preț „crowdsourced”).
3. **Caută același produs în celelalte magazine** și afișează în colțul din dreapta-jos un panou discret, „Același produs în alte magazine”: prețul din fiecare magazin, diferența față de pagina curentă și un link. Comparația este publică și funcționează și fără cont; doar utilizatorii conectați contribuie cu prețuri.

Pictograma extensiei arată pe insignă câte oferte mai ieftine există în alte magazine. Fereastra extensiei (click pe pictogramă) arată starea conexiunii, un comutator pornit/oprit și ultimele 5 prețuri citite.

Cupoanele nu sunt implementate.

## Ce trimite extensia (confidențialitate)

Extensia rulează **doar** pe cele trei magazine (`emag.ro`, `pcgarage.ro`, `altex.ro`) și trimite date **doar** de pe pagini recunoscute ca pagini de produs.

| Cerere | Când | Ce conține |
| --- | --- | --- |
| `product.ingestPrice` | doar conectat, doar dacă prețul s-a schimbat sau au trecut peste 6 ore de la ultima trimitere | magazinul, codul produsului din magazin, titlul, adresa paginii (fără parametri și fără `#`), imaginea, EAN-ul (doar dacă este un GTIN valid), codul de model normalizat (vezi „Limitări cunoscute”), prețul în bani, moneda, dacă produsul este în stoc |
| `catalog.lookup` | la fiecare pagină de produs, conectat sau nu | doar magazinul și codul produsului din magazin |
| `GET /api/auth/get-session` | când deschizi fereastra extensiei | nimic în afara cookie-ului tău de sesiune Arbitra |

Ce **nu** face extensia:

- nu citește și nu trimite cookie-urile, parolele sau datele de cont ale magazinelor;
- nu trimite istoricul de navigare și nu face nicio cerere pe pagini care nu sunt de produs;
- nu trimite nimic altundeva decât la adresa API configurată de tine (implicit `http://localhost:3000`);
- nu încarcă și nu execută cod de pe alte adrese;
- cu comutatorul oprit, nu face nicio cerere.

Cererile către API trimit cookie-ul de sesiune Arbitra (`credentials: "include"`), ca serverul să știe cine contribuie. Textele din pagini și din API ajung în pagină doar prin `textContent`, iar linkurile se deschid doar dacă sunt `http` sau `https`, cu `rel="noopener noreferrer"`.

Local, în `chrome.storage.local`, extensia păstrează: setările (`settings`), ultima trimitere a fiecărui produs (`seen:<magazin>:<cod>`, pentru fereastra de 6 ore), ultimele 5 produse citite (`recent`), momentul ultimei curățări (`seenPrunedAt`) și, doar după un răspuns 429, până când nu mai trimite cereri (`backoffUntil`).

## Limite ale observațiilor

Serviciul worker verifică fiecare observație cu aceleași reguli ca serverul (`ingestPriceInput` din `packages/api/src/routers/product.ts`), ca o observație care ar primi `BAD_REQUEST` să nu se piardă pe drum:

| Câmp | Regulă |
| --- | --- |
| `title` | cel mult 300 de caractere (un titlu mai lung se taie); caracterele de control devin spații |
| `externalId` | 1 până la 128 de caractere, fără caractere de control |
| `url` | pagina magazinului, în forma canonică a serverului: `https`, fără utilizator, parolă, port, query sau `#`, cel mult 2048 de caractere |
| `imageUrl` | adresă `http` sau `https` de cel mult 2048 de caractere (se trimite în forma normalizată); altfel lipsește din observație |
| `price` | întreg în bani, de la 1 la 10.000.000 (100.000 RON) |
| `currency` | doar `RON` (și `Lei`, pe care extractorul îl citește ca `RON`) |

O pagină într-o altă monedă (de exemplu `EUR`) nu se trimite și nu arată nicio eroare: panoul nu apare (răspunsul service worker-ului are starea `ignored`). Orice altă observație invalidă (preț peste plafon, link în afara magazinului) arată în panou „Observația primită nu este validă”.

## Limita de cereri a serverului (429)

Serverul limitează cererile pe client: `catalog.*` la 90 pe minut, `product.ingestPrice` la 120 pe minut, `cart.optimize` la 30 pe minut, cel mult 20 de proceduri într-un apel grupat și cel mult 256 KiB pe corp. Când răspunde cu 429 (HTTP 429 sau codul tRPC `TOO_MANY_REQUESTS`), extensia:

- citește `Retry-After` (în secunde, cel mult 10 minute; 60 de secunde când antetul lipsește sau nu e un număr de secunde) și salvează în `chrome.storage.local`, sub `backoffUntil`, momentul până la care nu mai face nicio cerere;
- cât ține pauza, nu trimite nici `product.ingestPrice`, nici `catalog.lookup`, iar panoul arată starea de eroare cu mesajul „Prea multe cereri, încerc din nou în câteva minute.”;
- după pauză reia cererile și șterge `backoffUntil` după primul răspuns bun. O valoare mai îndepărtată de 10 minute (ceas mutat, storage stricat) nu mai ține extensia oprită.

Fereastra extensiei și testul de conexiune din setări nu sunt oprite de pauză.

## Instalare în Chrome (necompilată)

Cerințe: Chrome 110 sau mai nou.

1. Deschide `chrome://extensions`.
2. Pornește **Modul dezvoltator** (Developer mode), din colțul din dreapta-sus.
3. Apasă **Încarcă extensie necompilată** (Load unpacked).
4. Alege folderul `extension` din acest repo (cel care conține `manifest.json`).
5. Fixează pictograma Arbitra în bara de unelte (meniul cu piesa de puzzle), ca să vezi insigna.

După ce modifici codul, apasă butonul de reîncărcare de pe cardul extensiei din `chrome://extensions`, apoi reîncarcă pagina magazinului. Erorile service worker-ului se văd cu linkul **service worker** de pe același card (Inspect views).

## Configurare

Fereastra extensiei, apoi **Setări** (sau click dreapta pe pictogramă, apoi *Opțiuni*):

| Câmp | Implicit | Rol |
| --- | --- | --- |
| Adresa API | `http://localhost:3000` | serverul Arbitra (Hono + tRPC) care primește prețurile |
| Adresa aplicației web | `http://localhost:3001` | pentru linkurile „Conectează-te”, „Caută produse” și „Panou” |

- Dacă schimbi adresa API, Chrome îți cere acordul ca extensia să comunice cu acel server (permisiune opțională). Fără acord, adresa nu se salvează.
- **Testează conexiunea** apelează `healthCheck` pe adresa din câmp și răspunde în română.
- Setările se păstrează în `chrome.storage.local`, sub cheia `settings`: `{ apiBase, webBase, enabled }`.

## Autentificare

Extensia nu are propriul cont: **refolosește sesiunea aplicației web**. Te conectezi pe site (butonul „Conectează-te” din fereastra extensiei deschide `/login`), iar service worker-ul trimite cookie-ul Better Auth către API cu `fetch(..., { credentials: "include" })`. Permisiunile pentru adresa API îi permit să ocolească CORS.

- Cookie-ul de sesiune este `secure` și `sameSite: none`. Pe `http://localhost` Chrome îl acceptă, deci în dezvoltare totul merge pe `http`.
- De la o adresă de rețea pe `http` (de exemplu `http://192.168.x.x:3000`) cookie-ul **nu** se setează. Un domeniu de producție are nevoie de **HTTPS**, iar serverul are nevoie de variabilele `BETTER_AUTH_URL` și `CORS_ORIGIN` potrivite (vezi `apps/server/.env.example`).

## Testare

### Teste automate

```bash
cd extension
bun test
```

Nu cer instalare de pachete și nu folosesc rețeaua: `chrome` și `fetch` sunt simulate, iar paginile sunt fixture-uri capturate de pe cele trei magazine (`test/fixtures/`). Testele acoperă logica, nu aspectul panoului în browser (pentru asta folosește testul manual de mai jos). `test/flow.test.js` leagă extractorul real și service worker-ul real: observație, `ingestPrice` o singură dată cu datele exacte, `lookup`, deduplicare la 6 ore, calea utilizatorului deconectat, pauza după 429 și pagina în altă monedă. `test/contract.test.js` trece observațiile validate prin regulile serverului (o copie a lor, scrisă în test) și, când pachetele monorepo-ului sunt instalate, prin schema reală `ingestPriceInput`. `test/model-code.test.js` compară regula codului de model din extensie cu cea de pe server (importă `packages/api/src/lib/identifiers.ts`, un fișier fără dependențe).

### Test manual pe o pagină reală

1. Din rădăcina repo-ului, pornește aplicația: `bun run dev` (API pe 3000, web pe 3001), cu baza de date configurată și datele demo încărcate (`bun run db:seed --yes`).
2. Încarcă extensia (secțiunea de mai sus) și conectează-te pe `http://localhost:3001/login` (contul demo este în `apps/server/src/scripts/seed.ts`).
3. Deschide o pagină de produs, de exemplu un SSD pe eMAG. După 1-2 secunde apare butonul **Arbitra** în colțul din dreapta-jos; apasă-l ca să vezi panoul.
4. Deschide fereastra extensiei: trebuie să arate „Conectat ca …”, iar produsul să apară la „Ultimele prețuri citite” cu eticheta „preț nou”.
5. Deschide același produs pe alt magazin (de exemplu pe Altex). Panoul trebuie să arate prețul de la eMAG, diferența și un link, iar insigna să numere ofertele mai ieftine.
6. Caută produsul pe `http://localhost:3001/cauta`: trebuie să apară cu ambele magazine.
7. Reîncarcă pagina: în service worker (Inspect views, fila Network) nu trebuie să apară un al doilea `product.ingestPrice`, doar `catalog.lookup`.
8. Deconectează-te de pe site și reîncarcă pagina de produs: panoul arată comparația și invitația „Conectează-te”, iar în fereastra extensiei apare „Nu ești conectat”.
9. Oprește comutatorul „Urmărește prețurile pe magazine” și reîncarcă: panoul dispare și nu se mai face nicio cerere.

## Limitări cunoscute

- **Potrivirea folosește EAN sau un cod de model conservator.** Același produs din magazine diferite se leagă prin EAN (GTIN valid) sau prin codul de model. Niciun magazin nu le expune pe amândouă: eMAG dă doar codul de model (câmpul `gtin` de acolo conține de fapt codul de model și este ignorat), Altex dă un GTIN, iar codul de model apare doar la sfârșitul titlului, de unde îl extragem euristic. Produsele fără niciunul dintre ele nu se potrivesc.
- **Variantele de capacitate sau de dimensiune nu se unesc niciodată.** Codul de model se normalizează fără să piardă ce distinge produsul: se taie doar sufixul producătorului sau al regiunii (`WDS100T4G0E-00CPS0` devine `WDS100T4G0E`, `MZ-V9P1T0BW/EU` devine `MZV9P1T0BW`, `MQ9X3DN/A` devine `MQ9X3DN`), iar capacitatea, dimensiunea sau memoria video rămân în cod (`SDSSDE61-500G-G25` devine `SDSSDE61500G`, `SA400S37/240G` și `SA400S37/480G` rămân coduri diferite, la fel `DUAL-RTX4060TI-O8G` și `DUAL-RTX4060TI-O16G`, ori `GV-N406TGAMING OC-8GD` și `OC-16GD`).
- **Regula codului de model (`primaryModelCode`).** Pașii, în ordine: se citesc cel mult 256 de caractere; se scot diacriticele (`ȘTEFAN` devine `STEFAN`); `N/A` ca valoare de sine stătătoare respinge tot textul (`Cod: N/A1` la fel), dar `/A` de la finalul unui cod Apple nu; se taie o etichetă de până la 3 cuvinte din litere urmată de `:` sau `#` (`Cod produs: X`, `Part Number: X`, `MPN: X`, `P/N: X`; literele care aparțin codului nu se taie, deci `PN1234AB` rămâne cod); se păstrează prima valoare dintr-o listă (`,` `;` `|`); parantezele despart segmentele, deci `WDS200T4G0E (EU)` și `TL-WR841N(EU)` pierd grupul `(EU)`; se taie sufixele care nu sunt capacități. Nu se trimit valorile care nu pot identifica un produs: text liber cu peste două cuvinte (`Full HD 1080p`, un titlu întreg), specificații și combinații de specificații (`128GB`, `HDMI21`, `8GB-DDR4`, `256GB SSD`, `M.2 2280`), substituenți (`TEST123`, `SAMPLE1`, `UNKNOWN1`, `NULL1234`, `AAAAA1`) și coduri sub 6 sau peste 64 de caractere, fără litere sau fără cifre. Din titlu se alege ultimul token care dă un cod valid cu cel puțin două litere, fără clase de viteză (`AX3000`), module de memorie (`PC4-25600`), procesoare (`I7-13650HX`, `13700K`) sau kituri (`2X16GB`). Codurile doar din cifre (de exemplu Logitech `910-005401`) nu se potrivesc după cod de model: produsele se leagă prin EAN.
- **Două copii ale aceleiași reguli.** Algoritmul are o copie pe server (`normalizeModelCode`, în `packages/api/src/lib/identifiers.ts`). Ambele se testează cu aceiași vectori (`test/fixtures/model-code-vectors.json` și `packages/api/src/lib/model-code-vectors.json`, fișiere identice octet cu octet; `test/model-code.test.js` verifică asta), cu o baterie de 135 de coduri reale de producător (Samsung, Kingston, Crucial, WD, SanDisk, Seagate, Lenovo, ASUS, Gigabyte, MSI, Sony, Apple, HP, Dell, TP-Link, Corsair, Intel, AMD ș.a., în `test/fixtures/model-code-battery.json`) și cu 20.000 de texte generate, pe care cele două implementații trebuie să le rezolve la fel: orice schimbare se face în ambele locuri. Serverul verifică din nou ce primește și ignoră identificatorii invalizi fără să piardă prețul.
- **Prețurile vin de la utilizatori.** Un preț este la fel de proaspăt ca ultima vizită a unui utilizator conectat; pagina poate arăta valori vechi. Pe eMAG, prețul din pagină poate aparține unui vânzător din marketplace.
- **Cupoanele nu sunt implementate.**
- **Doar Chrome** (și, probabil, alte browsere Chromium cu Manifest V3; netestat). Firefox nu este suportat.
- **Extragerea depinde de structura paginilor.** O schimbare a datelor structurate sau a adreselor de produs poate opri extragerea. Prețurile peste 100.000 RON (plafonul serverului) nu se trimit, iar paginile în altă monedă decât RON se ignoră (vezi „Limite ale observațiilor”).
- **Limite de cereri pe server:** apelurile `catalog.*` sunt limitate la 90 pe minut per client, `product.ingestPrice` la 120 pe minut și `cart.optimize` la 30 pe minut. Un apel grupat numără fiecare procedură din el și poate avea cel mult 20 de apeluri, iar corpul unei cereri cel mult 256 KiB. După un 429 extensia face pauză (vezi „Limita de cereri a serverului”). Cheia clientului este adresa conexiunii: în spatele unui reverse proxy sau a unei rețele comune mai mulți utilizatori pot împărți aceeași limită.
- Iconițele sunt generate din logo-ul Arbitra de `scripts/make-brand-assets.ps1` (împreună cu logo-ul și favicon-ul aplicației web).

## Harta fișierelor

```text
extension/
  manifest.json          Manifest V3: permisiuni, content script, service worker, popup, setări
  popup.html/js/css      Fereastra extensiei: conexiune, comutator, ultimele prețuri
  options.html/js/css    Pagina de setări: adresa API și web, permisiune, test de conexiune
  icons/                 Iconițe 16, 32, 48, 128
  scripts/make-brand-assets.ps1  Generează iconițele și logo-urile din logo-ul sursă (PowerShell)
  src/
    extract.js           Extragere produs și preț din pagină (script clasic, PretPilotExtract)
    overlay.js           Panoul „Același produs în alte magazine” (script clasic, PretPilotOverlay)
    content.js           Content script: urmărește pagina, trimite observația, desenează panoul
    background.js        Service worker: mesaje, trimitere la API, căutare, insignă
    logic.js             Logică pură a service worker-ului: validare, deduplicare, curățare răspuns
    api.js               Client tRPC și Better Auth (fetch cu cookie-uri, timeout, erori)
    settings.js          Setările din chrome.storage.local (cheia "settings")
    store.js             Starea locală: deduplicare și produse recente
  test/                  Teste bun:test, fixture-uri și simulatoare (chrome, fetch, pagini)
```

Scripturile de pe pagină se încarcă în această ordine și împart același scop izolat: `extract.js`, `overlay.js`, `content.js`. Contractul dintre piese este mesajul `pretpilot:observe` (content script către service worker), plus `pretpilot:status`, `pretpilot:set-enabled` și `pretpilot:test-connection` (fereastra extensiei și setările către service worker).

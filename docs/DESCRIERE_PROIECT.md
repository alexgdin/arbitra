# Arbitra: descrierea proiectului (VNU Hack 2026, echipa Hrongobar)

**Repo:** https://github.com/alexgdin/arbitra

## Problema
Același produs are prețuri foarte diferite în magazinele online din România, iar prețurile se schimbă zilnic. Exemplu real, observat pe 4 octombrie 2026: SSD-ul WD Green SN3000 de 2 TB costa 1.490,77 lei pe eMAG și 1.199,99 lei pe Altex, adică o diferență de 290,78 lei (24%). Ca să găsească prețul cel mai mic, cumpărătorul trebuie să verifice manual fiecare magazin, de fiecare dată. Nu e ușor nici de comparat: magazinele descriu același produs diferit (eMAG dă doar codul modelului, Altex un EAN, PC Garage un cod cu sufix de producător).

**Utilizatorul:** oricine cumpără online electronice și electrocasnice și vrea să plătească mai puțin, fără să piardă timp comparând.

## Soluția
Arbitra recunoaște același produs în eMAG, PC Garage și Altex („connect the dots”: ofertele răspândite în magazine sunt unite într-un singur produs) și arată unde e mai ieftin.
- Căutare publică, fără cont și fără diacritice, cu prețul din fiecare magazin, istoricul prețului și cât de proaspăt e fiecare preț.
- Potrivire între magazine după EAN validat cu cifra de control sau după codul de model normalizat; capacitățile diferite (1 TB și 2 TB) rămân produse separate.
- Alertă în aplicație: utilizatorul setează un preț țintă și primește notificare când prețul ajunge la țintă sau sub ea. Arbitra nu cumpără automat.
- Coș optimizat: împarte produsele între magazine ca totalul, cu transport inclus, să fie minim.
- Extensie de browser (Chrome): pe pagina unui produs din eMAG, PC Garage sau Altex arată prețul aceluiași produs în celelalte magazine. Pentru utilizatorii conectați, trimite prețul paginii vizitate, deci prețurile sunt adunate de comunitate, fără scraping pe server.

## Tehnologii folosite
Next.js 16, React 19, Tailwind CSS 4, componente shadcn/ui (Base UI), TanStack Query, Sonner, Lucide; Hono pe Bun, tRPC 11, Zod; Drizzle ORM peste PostgreSQL găzduit pe Neon (driver serverless prin WebSocket); Better Auth pentru autentificare; varlock pentru variabilele de mediu; Turborepo (monorepo); extensie Chrome Manifest V3 în JavaScript simplu. Proiectul a pornit de la șablonul Better-T-Stack.

## Date și surse
- Prețurile reale ale SSD-urilor WD au fost văzute pe paginile publice eMAG, Altex și PC Garage pe 4 octombrie 2026.
- Restul catalogului (27 de oferte) e format din date demonstrative, iar butonul „Deschide în magazin” duce la căutarea reală din magazin.
- Costurile de transport din optimizare sunt demonstrative.

## Testare
1.699 de teste automate care trec (668 pentru API, 72 pentru server, 959 pentru extensie). Extracția prețului a fost verificată pe pagini reale din cele trei magazine.

## Folosirea inteligenței artificiale (declarație conform regulamentului, secțiunea 5.2)
Am folosit Claude Code (Anthropic), un asistent AI pentru programare, pe parcursul întregului proiect.
- **Generat sau asistat de AI:** cea mai mare parte a codului (aplicația web, API-ul, schema bazei de date, algoritmii de potrivire și de optimizare a coșului, extensia), testele automate, textele paginilor legale (termeni, confidențialitate, cookie-uri), documentația (README) și slide-urile prezentării.
- **Contribuția echipei:** [completați: de exemplu ideea și alegerea problemei, deciziile de produs (ce funcții intră, numele Arbitra, scoaterea cumpărării automate în favoarea alertelor, direcția de design), logo-ul, verificarea prețurilor reale în magazine, testarea aplicației și a extensiei, prezentarea și demo-ul].

## Contribuția fiecărui membru
- [Nume 1]: [contribuție]
- [Nume 2]: [contribuție]
- [Nume 3]: [contribuție]

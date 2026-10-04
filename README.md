# PretPilot

**Plătești mai puțin. Automat.**

PretPilot urmărește prețurile din magazinele online din România (eMAG, PC Garage, Altex), îți arată istoricul lor, te ajută să stabilești un preț țintă și să-ți împarți coșul între magazine ca să plătești cât mai puțin, transportul inclus.

Proiect făcut pentru un hackathon de 24 de ore. Este un MVP: unele părți sunt complete, altele sunt doar începute (vezi mai jos).

## Ce funcționează acum

| Funcție | Stare |
| --- | --- |
| Istoric de prețuri cu grafic (7 / 30 / 90 / 365 zile, minim, maxim, linia țintei) | Gata |
| Listă de urmărire cu preț țintă și adăugare manuală de produse | Gata |
| Optimizare de coș între magazine (cu transport și prag de transport gratuit) | Gata, cu costuri de transport demonstrative |
| Autentificare cu email și parolă | Gata |
| Broker automat: setări, limite, adresă de livrare, ținte de preț | Interfața e gata; **cumpărarea efectivă nu e implementată** |
| Protecția prețului (cerere de rambursare dacă prețul scade în 14 zile) | Doar schema din baza de date; logica și interfața lipsesc |
| Extensie de browser (preia prețuri, cupoane automate) | Neînceput |

Costurile de transport din `packages/api/src/lib/store-config.ts` sunt valori orientative. Înlocuiește-le cu tarifele reale înainte de a le prezenta ca fiind exacte.

## Stack

Monorepo Bun + Turborepo, generat cu [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack).

- **Web:** Next.js 16 (App Router, React 19), Tailwind CSS 4, TanStack Query, componente shadcn partajate
- **API:** Hono pe Bun, tRPC 11
- **Date:** PostgreSQL (de exemplu Neon), Drizzle ORM 1.0 (release candidate)
- **Autentificare:** Better Auth
- **Mediu:** [Varlock](https://varlock.dev) pentru schema și validarea variabilelor de mediu

## Pornire rapidă

Ai nevoie de [Bun](https://bun.sh) 1.4+, Node.js 20.9+ (cerut de Next.js) și o bază de date PostgreSQL. Cel mai simplu e un proiect gratuit pe [Neon](https://neon.tech).

```bash
bun install
```

Creează fișierele de mediu pornind de la exemple și completează `DATABASE_URL` (și un `BETTER_AUTH_SECRET` propriu, vezi comentariul din fișier):

```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
```

În `cmd.exe` folosește `copy apps\server\.env.example apps\server\.env` și `copy apps\web\.env.example apps\web\.env`.

Creează tabelele, încarcă date demonstrative și pornește aplicația:

```bash
bun run db:push
bun run db:seed --yes
bun run dev
```

- Aplicația web: <http://localhost:3001>
- API: <http://localhost:3000>

### Cont demo

`bun run db:seed --yes` creează utilizatorul `demo@pretpilot.test`, 27 de produse (9 articole în cele 3 magazine), aproximativ 90 de zile de istoric de prețuri, un coș cu ținte și două comenzi. Parola demo este definită în [`apps/server/src/scripts/seed.ts`](apps/server/src/scripts/seed.ts) (`DEMO_PASSWORD`) și e doar pentru testare locală.

Scriptul afișează ce bază de date folosește (doar hostname-ul) și nu scrie nimic fără `--yes`. Ca să ștergi exact datele demo:

```bash
bun run db:seed:reset --yes --no-seed
```

### Pe Windows

Pe unele versiuni de Node pentru Windows, trimiterea telemetriei varlock la ieșire oprește procesul cu eroarea `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`. Repo-ul dezactivează telemetria prin [`.varlock/config.json`](.varlock/config.json), deci nu trebuie să faci nimic.

## Scripturi

| Comandă | Ce face |
| --- | --- |
| `bun run dev` | Pornește web și server în modul de dezvoltare |
| `bun run dev:web` / `bun run dev:server` | Pornește doar una dintre aplicații |
| `bun run build` | Compilează toate aplicațiile |
| `bun run check-types` | Verifică tipurile TypeScript în tot proiectul |
| `bun run --cwd packages/api test` | Rulează testele motorului de optimizare |
| `bun run db:push` | Aplică schema Drizzle în baza de date |
| `bun run db:studio` | Deschide Drizzle Studio |
| `bun run db:seed --yes` | Încarcă datele demonstrative |
| `bun run db:seed:reset --yes` | Șterge datele demo și le recreează |

## Structura proiectului

```
apps/
  web/        Next.js: landing, autentificare, panou (prezentare, coș, broker)
  server/     Hono: /trpc, /api/auth, scriptul de seed
packages/
  api/        Routere tRPC (product, cart, broker) și motorul de optimizare a coșului
  auth/       Configurarea Better Auth
  db/         Schema Drizzle (produse, istoric de prețuri, coș, comenzi) și relațiile
  ui/         Componente shadcn partajate și tokenii de design
```

## Decizii de proiectare

- **Sumele sunt numere întregi în bani** (129,99 RON = `12999`) peste tot: în baza de date, în API și în interfață. Formatarea se face doar în `apps/web/src/lib/format.ts`.
- **Același produs în mai multe magazine** se recunoaște după codul EAN. Optimizatorul compară ofertele cu același EAN.
- **Optimizarea coșului** minimizează costul articolelor plus transportul, ținând cont de pragul de transport gratuit al fiecărui magazin. Până la 12 articole caută exact (branch and bound), peste această limită folosește o euristică. Detalii în `packages/api/src/lib/cart-optimizer.ts`.
- **Metoda de plată** a brokerului stochează doar o referință (token) de la un furnizor de plăți, niciodată date de card, iar API-ul nu o returnează clientului.
- **Rutele care scriu date** cer autentificare. Adresele de produs acceptate de `product.ingestPrice` sunt doar `http` și `https`.

## Variabile de mediu

Fiecare aplicație își declară variabilele în `.env.schema` (tipuri, obligatoriu/opțional), iar Varlock le validează la pornire și generează `src/env.ts` la `bun install`. Fișierele `.env` sunt ignorate de git; versionezi doar schemele și fișierele `.env.example`. După ce schimbi o schemă, rulează `bun run env:generate`.

## Limitări cunoscute și pașii următori

- Broker automat: lipsește procesul care urmărește prețurile și plasează comenzile.
- Protecția prețului: lipsesc compararea cu istoricul comenzilor din ultimele 14 zile și generarea cererii de rambursare.
- Extensia de browser care ar trimite prețurile către `product.ingestPrice` nu există încă; până atunci produsele se adaugă manual din panou.
- `bun run check` (Ultracite/Biome) raportează erori de formatare, pentru că `biome.json` cere tab-uri, iar tot codul folosește 2 spații.
- Imaginile produselor nu sunt afișate (ar fi nevoie de `remotePatterns` în `next.config.ts`).

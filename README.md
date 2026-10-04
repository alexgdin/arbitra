# Arbitrage

**Același produs. Prețul cel mai mic.**

Arbitrage compară prețurile aceluiași produs între magazinele online din România (eMAG, PC Garage, Altex), îți arată istoricul lor și cât de proaspăt e fiecare preț, te ajută să-ți împarți coșul între magazine ca să plătești cât mai puțin (transportul inclus) și îți permite să stabilești un preț țintă. **Nu ai nevoie de cont ca să cauți și să compari prețuri.**

Proiect făcut pentru un hackathon de 24 de ore. Este un prototip: unele părți sunt complete, altele sunt doar începute (vezi mai jos).

## Ce funcționează acum

| Funcție | Stare |
| --- | --- |
| **Căutare publică fără cont** (`/cauta`), fără diacritice, cu comparare între magazine | Gata |
| **Pagină publică de produs** (`/produs/[id]`): oferte pe magazin, cel mai mic preț, istoric pe magazin și perioadă | Gata |
| **Prospețimea prețului** pe fiecare ofertă („Actualizat acum 3 ore”, „Preț posibil depășit” după 24 h) | Gata |
| **Potrivire între magazine** după EAN valid sau cod de model, cu regulă conservatoare (variantele de capacitate nu se unesc) | Gata |
| **Extensie de browser** (Chrome, Manifest V3) pentru eMAG, PC Garage și Altex: extrage prețul, îl trimite când ești conectat și arată comparația pe pagină | Gata, validată pe pagini reale; încărcare manuală în Chrome |
| Listă de urmărire cu preț țintă, grafic și adăugare manuală de produse | Gata |
| Optimizare de coș între magazine (transport și prag de transport gratuit) | Gata, cu costuri de transport demonstrative |
| Autentificare cu email și parolă | Gata |
| Notificări în aplicație când prețul ajunge la țintă | **În lucru** (vezi `docs/NEXT_STEPS.md`) |
| Protecția prețului (cerere de rambursare dacă prețul scade în 14 zile) | **În lucru**: există doar schema din baza de date |
| Cupoane automate | Neînceput |

Pagina „Broker automat” și comutatorul „Cumpără automat” din panou sunt rămase din prima versiune și urmează să fie înlocuite cu alertele în aplicație. **Cumpărarea efectivă nu este implementată.**

Costurile de transport din `packages/api/src/lib/store-config.ts` sunt valori orientative. Înlocuiește-le cu tarifele reale înainte de a le prezenta ca fiind exacte. Prețurile pe care le vezi vin din date demonstrative (seed) și de la utilizatorii care folosesc extensia; **serverul nu face scraping** al magazinelor.

## Stack

Monorepo Bun + Turborepo, generat cu [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack).

- **Web:** Next.js 16 (App Router, React 19), Tailwind CSS 4, TanStack Query, componente shadcn partajate
- **API:** Hono pe Bun, tRPC 11
- **Date:** PostgreSQL (de exemplu Neon), Drizzle ORM 1.0 (release candidate)
- **Autentificare:** Better Auth
- **Extensie:** Chrome Manifest V3, JavaScript simplu, fără build și fără dependențe
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

`bun run db:seed --yes` creează utilizatorul demo, 27 de produse (9 articole în cele 3 magazine), aproximativ 90 de zile de istoric de prețuri, un coș cu ținte și două comenzi. Emailul și parola demo sunt definite în [`apps/server/src/scripts/seed.ts`](apps/server/src/scripts/seed.ts) (`DEMO_EMAIL`, `DEMO_PASSWORD`) și sunt doar pentru testare locală.

Scriptul afișează ce bază de date folosește (doar hostname-ul) și nu scrie nimic fără `--yes`. Ca să ștergi exact datele demo:

```bash
bun run db:seed:reset --yes --no-seed
```

### Extensia de browser

În Chrome: `chrome://extensions` → activează „Mod dezvoltator” → „Încarcă nepachetat” → alege folderul `extension/`. Detalii, ce trimite extensia (confidențialitate) și pași de testare: [`extension/README.md`](extension/README.md).

### Pe Windows

Pe unele versiuni de Node pentru Windows, trimiterea telemetriei varlock la ieșire oprește procesul cu eroarea `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`. Repo-ul dezactivează telemetria prin [`.varlock/config.json`](.varlock/config.json), deci nu trebuie să faci nimic.

## Scripturi

| Comandă | Ce face |
| --- | --- |
| `bun run dev` | Pornește web și server în modul de dezvoltare |
| `bun run dev:web` / `bun run dev:server` | Pornește doar una dintre aplicații |
| `bun run build` | Compilează toate aplicațiile |
| `bun run check-types` | Verifică tipurile TypeScript în tot proiectul |
| `bun run --cwd packages/api test` | Testele API-ului (potrivire, optimizare de coș, căutare) |
| `bun run --cwd apps/server test` | Testele serverului (limitare de cereri) |
| `bun test` în `extension/` | Testele extensiei |
| `bun run db:push` | Aplică schema Drizzle în baza de date |
| `bun run db:studio` | Deschide Drizzle Studio |
| `bun run db:seed --yes` | Încarcă datele demonstrative |
| `bun run db:seed:reset --yes` | Șterge datele demo și le recreează |

## Structura proiectului

```
apps/
  web/        Next.js: pagina de pornire, căutare publică, pagina de produs, autentificare, panou
  server/     Hono: /trpc, /api/auth, limitare de cereri, scriptul de seed
packages/
  api/        Routere tRPC (catalog, product, cart, broker), potrivirea produselor, optimizarea coșului
  auth/       Configurarea Better Auth
  db/         Schema Drizzle (produse, istoric de prețuri, coș, comenzi) și relațiile
  ui/         Componente shadcn partajate și tokenii de design
extension/    Extensia de browser (Chrome MV3, fără build)
docs/         PROJECT_CONTEXT.md (context tehnic), NEXT_STEPS.md (ce a rămas și cum continui)
```

## Decizii de proiectare

- **Sumele sunt numere întregi în bani** (129,99 RON = `12999`) peste tot. Formatarea se face doar în `apps/web/src/lib/format.ts`.
- **Potrivirea între magazine** nu se bazează pe un singur câmp: magazinele expun identificatori diferiți (eMAG doar codul modelului, Altex un EAN real, PC Garage un cod cu sufix). Două oferte sunt același produs dacă au același EAN valid sau același cod de model normalizat; sufixele de producător se taie, dar variantele de capacitate nu se unesc.
- **Optimizarea coșului** minimizează costul articolelor plus transportul, cu pragul de transport gratuit al fiecărui magazin: căutare exactă până la 12 articole, euristică peste această limită.
- **Datele vin de la utilizatori, nu din scraping pe server** (`robots.txt` de la eMAG interzice `/product/` pentru crawlere). Extensia trimite prețul paginii pe care o vizitezi, doar când ești conectat.
- **Siguranța suprafeței publice:** magazine permise doar `emag`, `pcgarage`, `altex`; linkurile trebuie să fie pe domeniul magazinului; identificatorii nu pot fi suprascriși; limite pe lungimea câmpurilor; limitare de cereri pe `catalog.*` și limită la mărimea loturilor tRPC.

## Variabile de mediu

Fiecare aplicație își declară variabilele în `.env.schema`, iar Varlock le validează la pornire și generează `src/env.ts` la `bun install`. Fișierele `.env` sunt ignorate de git; versionezi doar schemele și fișierele `.env.example`. După ce schimbi o schemă, rulează `bun run env:generate`.

## Limitări cunoscute

Lista completă și pașii de continuare sunt în [`docs/NEXT_STEPS.md`](docs/NEXT_STEPS.md). Pe scurt:

- Notificările în aplicație și protecția prețului nu sunt gata; brokerul din prima versiune urmează să fie scos.
- Mai sunt de adăugat: o limită la mărimea corpului cererilor, mesaje de eroare generice către client și configurația de hosting.
- Prețurile colectate de utilizatori pot fi false; sunt necesare reputația contributorilor și coroborarea între utilizatori.
- `bun run check` (Ultracite/Biome) raportează erori de formatare, pentru că `biome.json` cere tab-uri, iar tot codul folosește 2 spații.
- Imaginile produselor nu sunt afișate.

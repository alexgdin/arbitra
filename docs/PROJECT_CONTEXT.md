# PretPilot: context complet al proiectului (document de predare)

Scopul acestui fișier: să poți continua proiectul cu alt asistent AI, alt cont sau după o pauză lungă, fără să pierzi nimic din ce s-a stabilit și descoperit. Nu conține secrete. Starea descrisă este cea de la commit-ul `d27637c` (branch `main`).

## 0. Prompt de pornire (copiază-l într-o conversație nouă)

> Lucrezi pe proiectul PretPilot, un monorepo Bun + Turborepo (Next.js 16, Hono, tRPC, Drizzle 1.0 RC, Better Auth, Postgres pe Neon). Citește întâi `docs/PROJECT_CONTEXT.md` și `README.md`. Răspunde-mi în română. Înainte să afirmi că ceva funcționează, verifică (typecheck, teste, rulare). Nu face push, nu șterge date și nu scrie în baza de date fără acordul meu explicit. Comite doar când ți-o cer. Nu pune secrete în git. Versiunile bibliotecilor sunt foarte noi, deci citește documentația din `node_modules` înainte să scrii cod pentru Next.js sau Drizzle (secțiunea 8 enumeră capcanele deja descoperite).

## 1. Ce este proiectul

Platformă de cumpărături inteligente pentru România (eMAG, PC Garage, Altex), construită ca MVP pentru un hackathon de 24 de ore. Funcții țintă:

1. **Price Tracking:** istoric de prețuri pe produs.
2. **Cuponerie:** cupoane aplicate automat (prin extensia de browser).
3. **Auto-Broker:** cumpărare automată când un produs atinge prețul țintă.
4. **Cart Optimization:** împarte coșul între magazine ca totalul, cu transport, să fie minim.
5. **Price Protection:** cerere de rambursare dacă prețul scade în 14 zile după cumpărare.

Numele de lucru este **PretPilot**, definit într-un singur loc: `apps/web/src/lib/brand.ts`. Dacă se schimbă, se schimbă acolo și în texte.

### Planul inițial pe pași și starea lui

| Pas | Conținut | Stare |
| --- | --- | --- |
| 1 | Baza de date și schema Drizzle (users cu setări broker, products, price_history, cart_items, orders) | **Gata**, aplicată pe Neon |
| 2 | Routere tRPC: product, broker, cart | **Gata** |
| 3 | Cart Optimization Engine | **Gata** (17 teste) |
| 3 | Price Protection Broker (compară prețul curent cu comenzile din ultimele 14 zile) | **Neînceput** |
| 4 | Frontend: dashboard, PriceChart, CartOptimizer, BrokerSettings, landing, login | **Gata** |
| 5 | Extensie de browser Manifest V3 (content script care extrage prețul de pe eMAG/PC Garage și îl trimite la API, background script cu cupoane) | **Neînceput** |

Lipsește și **procesul care execută brokerul automat** (urmărește prețurile și plasează comenzile). Interfața lui există, execuția nu.

## 2. Stack și versiuni

- Monorepo **Bun 1.4.2 + Turborepo 2.11** (generat cu Better-T-Stack). Node v25.6.1 pe mașina de dezvoltare (Next cere Node 20.9+).
- **apps/web:** Next.js 16.3 (App Router, Turbopack, `typedRoutes`, React Compiler), React 19, Tailwind CSS 4, TanStack Query, `@trpc/tanstack-react-query`, TanStack Form, Better Auth client, sonner, lucide-react, next-themes.
- **apps/server:** Hono pe Bun, `@hono/trpc-server`. Port 3000. Web pe 3001.
- **packages/api:** routere tRPC 11, motorul de optimizare.
- **packages/db:** **Drizzle ORM 1.0.0-rc.4** pe node-postgres. **packages/auth:** Better Auth 1.7.5. **packages/ui:** componente shadcn (stilul `base-lyra`, pe `@base-ui/react`) și tokenii de design.
- **Mediu:** Varlock 1.18 (`.env.schema` per aplicație, tipuri generate în `src/env.ts`). Zod 4, TypeScript 6, Biome + Ultracite.
- **Date:** PostgreSQL pe Neon (cloud). Șirul de conexiune este doar în `apps/server/.env` (ignorat de git).

## 3. Modelul de date (packages/db/src/schema)

Sumele sunt **numere întregi în bani** (129,99 RON = `12999`) peste tot (baza de date, API, interfață).

- **`user`** (Better Auth, în `auth.ts`) + câmpuri broker: `brokerEnabled`, `brokerMaxOrderValue`, `brokerMonthlyBudget`, `brokerPaymentMethodRef` (doar token de la un furnizor, niciodată date de card), `shippingAddress` (jsonb, tipul `ShippingAddress`). Primele trei sunt expuse și ca `additionalFields` în Better Auth.
- **`products`:** o linie per produs per magazin (`store`, `externalId` unice împreună), `ean` leagă același articol între magazine, `currentPrice`, `inStock`, `lastCheckedAt`.
- **`price_history`:** `productId`, `price`, `inStock`, `source` (`extension` / `crawler` / `manual`), `recordedAt`. Index pe (productId, recordedAt).
- **`cart_items`:** coșul **și lista de urmărire** în același tabel: `quantity`, `targetPrice`, `autoBuyEnabled`. Unic pe (userId, productId).
- **`orders`:** pregătit pentru Price Protection: `unitPrice` plătit, `status`, `source` (`manual` / `auto_broker`), `purchasedAt`, `protectionStatus` (`monitoring` / `claim_generated` / `refunded` / `expired`), `protectionExpiresAt` (implicit now + 14 zile), `refundAmount`, `refundClaimText`, `refundClaimedAt`.
- **Relații:** `packages/db/src/relations.ts` combină `defineRelations(schema)` cu părțile `authRelations` și `commerceRelations`, făcute cu `defineRelationsPart` (vezi capcanele Drizzle în secțiunea 8).

## 4. API (packages/api, routere montate în `routers/index.ts`)

| Router | Proceduri |
| --- | --- |
| `product` | `ingestPrice` (protejat; upsert + istoric doar dacă prețul s-a schimbat), `getById`, `list`, `history` (public) |
| `broker` | `getSettings`, `updateSettings`, `setTarget`, `clearTarget`, `listTargets` (toate protejate) |
| `cart` | `list`, `add`, `updateQuantity`, `remove`, `clear`, `optimize` (toate protejate; `optimize` este **query**, nu mutation) |

`protectedProcedure` cere sesiune (`UNAUTHORIZED` altfel). `getSettings` nu returnează tokenul metodei de plată, doar `hasPaymentMethod`. URL-urile din `ingestPrice` acceptă doar `http` și `https`. Schemele zod comune sunt în `packages/api/src/schemas.ts` (`bani`, `httpUrl`).

### Motorul de optimizare (`packages/api/src/lib/cart-optimizer.ts`)

Funcție pură `optimizeCart(items, currency)`. Minimizează articolele plus transportul, cu pragul de transport gratuit per magazin. Până la 12 articole caută exact (branch and bound, cu limită de ~2.000.000 de noduri), peste aceasta folosește greedy plus căutare locală (`method: "heuristic"`). `cart.optimize` găsește ofertele după **EAN** comun. Costurile de transport din `store-config.ts` sunt **valori demonstrative** (eMAG 19,99 lei, gratuit peste 150; PC Garage 14,99, peste 200; Altex 17,99, peste 250). Testele sunt în `cart-optimizer.test.ts`.

## 5. Frontend (apps/web/src)

Rute: `/` (landing), `/login`, `/dashboard` (prezentare), `/dashboard/cart`, `/dashboard/broker`, plus `not-found`, `error`, `loading`. Layout-ul `/dashboard` verifică sesiunea pe server și afișează navigarea cu tab-uri.

- **Design:** prietenos, smarald/teal (hue ~165), colțuri rotunjite (radius 0.75rem), Geist, 14px. Tokeni în `packages/ui/src/styles/globals.css`: `--success`, `--warning`, `--store-emag|pcgarage|altex|other`, `--chart-line`, `--chart-area`. Mod dark complet.
- **Helperi centrali:** `lib/format.ts` (bani, procente, date; **singurul loc** unde se formatează sume), `lib/stores.ts` (metadate magazine), `lib/brand.ts`, `lib/safe-href.ts` (linkuri externe doar http/https), `hooks/use-hydrated.ts`, `hooks/use-debounced-value.ts`, `utils/trpc.ts` (client și erori traduse în română).
- **Componente:** `components/dashboard/` (PriceChart în SVG fără bibliotecă, Sparkline, Watchlist, ProductDetail, TargetEditor, AddProductForm), `components/cart/`, `components/broker/`, `components/landing/`. Textele sunt în română.
- Produsele se pot adăuga **manual** din dashboard (`ingestPrice` plus `cart.add`), până există extensia.

## 6. Date demo și testare

```bash
bun run db:seed --yes                    # creează/actualizează datele demo (idempotent)
bun run db:seed:reset --yes --no-seed    # șterge exact datele demo
```

Seed-ul (`apps/server/src/scripts/seed.ts`): 27 de produse (9 articole în 3 magazine, 2 fără stoc), ~1.600 de puncte de preț pe ~90 de zile, utilizatorul `demo@pretpilot.test` (parola e `DEMO_PASSWORD` în fișier), 6 articole în coș (5 cu țintă, dintre care 2 atinse; 2 cu auto-cumpărare) și 2 comenzi recente. Afișează doar hostname-ul bazei de date și nu scrie fără `--yes`.

Verificări: `bun run check-types` (6 task-uri), `bun run --cwd packages/api test` (17 teste), `bun run build`, `bun run dev`. S-au parcurs în browser: landing, login, dashboard, coș (optimizare reală pe datele demo), broker; desktop, mobil 375px și dark mode. **Neverificat manual:** trimiterea formularelor (adaugă produs, setează țintă, salvează setări broker), tooltip-ul graficului la hover și tastatură, landing și coș în dark mode.

## 7. Istoricul git (15 commit-uri pe `main`)

`initial commit` → schema comercială → fix varlock → routere → design system → motor de optimizare → seed → shell web → landing/login → coș → broker → dashboard → `AGENTS.md` generat de turbo → fix `allowedDevOrigins` → README și `.env.example`. Convenție: Conventional Commits în engleză, cu trailerul `Co-Authored-By`. Nu există remote configurat; **nimic nu a fost împins pe GitHub**. Branch-ul `feat/commerce-schema` este identic cu `main`.

## 8. Capcane descoperite (importante, ca să nu se repete)

1. **Varlock blochează procesele pe Windows** (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`): telemetria trimisă la ieșire declanșează un bug cunoscut libuv/Node. Soluția din repo este `.varlock/config.json` cu `telemetryDisabled: true`. Variabila de mediu `VARLOCK_TELEMETRY_DISABLED` nu e suficientă prin `turbo` (modul strict filtrează variabilele nedeclarate în `turbo.json`; neverificat direct). `--bun` nu ajută.
2. **Drizzle 1.0 RC:** `relations()` din 0.x **nu mai există**. Se folosește `defineRelationsPart(schema, (r) => ...)`. Părțile se combină prin spread în `relations.ts`, deci **cheile de tabel nu trebuie să se suprapună** între părți (altfel una o suprascrie pe cealaltă). Interogările relaționale folosesc sintaxa v2 (`where: { email }`).
3. **Dependențe izolate în Bun:** orice pachet care importă `drizzle-orm` (operatori `eq`, `and` etc.) trebuie să-l aibă în propriul `package.json` (`"drizzle-orm": "catalog:"`). Așa sunt acum `packages/api` și `apps/server`.
4. **Next.js 16:** `typedRoutes` este activ, deci după ce adaugi o pagină nouă rulează `bun x next typegen` în `apps/web`, altfel `tsc` respinge `<Link>`-urile către ea. Dev-server-ul blochează origini străine: `allowedDevOrigins` din `next.config.ts` conține acum o singură adresă LAN, care se schimbă cu rețeaua. Documentația locală este în `apps/web/node_modules/next/dist/docs/`.
5. **Hidratare:** UI care depinde de sesiune (salut, meniu utilizator) se protejează cu `useHydrated()`, altfel apare eroare de hidratare când sesiunea e în cache.
6. **tRPC fără transformer:** valorile `Date` ajung în browser ca șiruri ISO; se învelesc cu `new Date(...)`.
7. **Autentificare și cookie-uri:** cookie-ul de sesiune este `secure` + `sameSite: none`. Funcționează pe `http://localhost`, dar **nu** de la o adresă de rețea pe `http`. Pentru telefon sau extensie e nevoie de HTTPS (tunel) și de `CORS_ORIGIN` / `NEXT_PUBLIC_SERVER_URL` potrivite. Extensia va trebui să trimită cookie-ul (`credentials: "include"`) sau să primească alt mecanism de autentificare.
8. **Neon:** pornirea la rece durează ~3 s, iar prima conexiune poate da `ETIMEDOUT` trecător (se reia). Avertismentul `sslmode` dispare cu `sslmode=verify-full` în `DATABASE_URL`.
9. **Lint:** `bun run check` raportează ~870 de erori de formatare, pentru că `biome.json` cere tab-uri, iar tot codul folosește 2 spații (inclusiv șablonul inițial). Nu e un gate real.
10. **Windows:** căile lungi (>260 de caractere) pică la `git clone`; PowerShell afișează stderr-ul lui Bun ca `NativeCommandError` (inofensiv); utilizatorul lucrează din `cmd.exe`.

## 9. Ce urmează (propunere, în ordinea valorii pentru demo)

1. **Price Protection Broker (Pasul 3, partea a doua).** Funcție pură: pentru comenzile cu `protectionStatus = "monitoring"` și `protectionExpiresAt > acum`, compară `unitPrice` cu `products.currentPrice`. Dacă prețul a scăzut, calculează `refundAmount = (unitPrice - currentPrice) * quantity`, generează `refundClaimText` (text pentru magazin) și trece comanda în `claim_generated`. Apoi: router `orders`/`protection` și o pagină `/dashboard/protectie`. Seed-ul are deja 2 comenzi cu prețuri mai mari decât cele curente.
2. **Extensia de browser (Pasul 5).** `manifest.json` MV3, `content_script.js` care citește prețul, titlul, EAN-ul și stocul pe eMAG și PC Garage și apelează `product.ingestPrice`; `background.js` pentru cupoane. Atenție la autentificare și CORS (capcana 7).
3. **Procesul brokerului:** job periodic (Bun cron sau endpoint apelat de un scheduler) care ia `cart_items` cu `autoBuyEnabled`, `currentPrice <= targetPrice`, broker activ și în limitele de cheltuieli, apoi creează o comandă (`source = "auto_broker"`). Fără plăți reale în MVP: simulat.
4. **Decizii rămase deschise:** culoarea insignei „Țintă atinsă” (amber în landing, verde în dashboard și broker), „RON” sau „lei” în afișarea sumelor, licența repo-ului, formatarea Biome, tarifele reale de transport, imaginile produselor (ar cere `remotePatterns` în `next.config.ts`).

## 10. Preferințe de lucru ale utilizatorului (observate)

- Comunică în **română**; pune în conversație rezultatele comenzilor ca să le depanezi împreună.
- A început cu modelul „pas cu pas, aștept confirmarea” (cod în chat, el îl salvează), apoi a acceptat ca asistentul să scrie direct în proiect și să verifice. Comite doar când i se cere explicit („Commit the working tree changes with a sensible message”).
- Apreciază verificarea reală (rulări, capturi de ecran) față de afirmații, și onestitatea despre ce nu a fost testat.
- Acțiunile care publică sau modifică exteriorul (push, creare repo, scriere în baza de date) cer acord explicit. Scrierea în Neon pentru seed a fost anunțată și acceptată.

## 11. Ce trebuie reconfigurat pe un cont sau o mașină nouă

Nu se află în repo: șirul de conexiune Postgres (`DATABASE_URL`) și `BETTER_AUTH_SECRET` din `apps/server/.env`; `NEXT_PUBLIC_SERVER_URL` din `apps/web/.env` (modele în fișierele `.env.example`); identitatea git (`user.name`, `user.email`) și remote-ul GitHub; adresa din `allowedDevOrigins`. Pașii de instalare sunt în `README.md`.

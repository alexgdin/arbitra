# Arbitrage: ce e gata, ce a rămas și cum continui fără asistent

Starea la commit-ul `2ea3478` (branch `main`, 4 commit-uri noi peste `d27637c`). Verificat înainte de commit: `tsc` curat în api/server/web; teste: **649** (packages/api), **72** (apps/server), **959** (extension), toate trec. Citește și `docs/PROJECT_CONTEXT.md` (capcane tehnice, secțiunea 8) și `README.md`.

## 1. Ce funcționează acum
- **Căutare publică fără cont** (`/cauta`), fără diacritice, cu comparare între magazine și prospețimea prețului; **pagina publică de produs** (`/produs/[id]`) cu istoric pe magazin.
- **Potrivire între magazine** după EAN valid sau cod de model (`mpn`), cu regulă conservatoare (variantele de capacitate nu se unesc). API public: `catalog.search`, `catalog.compare`, `catalog.lookup`.
- **Extensia de browser** (`extension/`, Chrome MV3, fără build): extrage prețul pe eMAG/PC Garage/Altex, îl trimite dacă ești conectat, arată panou de comparare. **Validată pe pagini reale** ale celor 3 magazine. Încarci din `chrome://extensions` → Mod dezvoltator → „Încarcă nepachetat” → folderul `extension/`.
- Dashboard cu istoric/grafic, prețuri țintă, optimizare de coș între magazine, protecții (limite pe câmpuri, rate limit pe `catalog.*`, store doar `emag|pcgarage|altex`, URL pe domeniul magazinului).
- Baza Neon are deja `products.search_text` și `products.mpn` (aplicate cu `db:push`).

## 2. Pornire rapidă
```
bun install
bun run dev                # web 3001, server 3000
bun run db:seed --yes      # date demo (utilizator demo@pretpilot.test, parola e DEMO_PASSWORD în apps/server/src/scripts/seed.ts)
```
Fișiere de mediu: copiază `apps/server/.env.example` și `apps/web/.env.example` în `.env` (valorile reale NU se comit).

## 3. Ce NU e gata (în ordinea priorității pentru juriu)

### A. Redenumirea în Arbitrage (parțială)
Făcut doar în `apps/web/src/lib/brand.ts` (nume, tagline, descriere). **Mai apare „PretPilot”** în: extensie (manifest, popup/options, prefixul mesajelor `pretpilot:*`, globalele `PretPilotExtract`/`PretPilotOverlay`, teste), `README.md`, `docs/`, `apps/server/src/scripts/seed.ts` (email demo `demo@pretpilot.test`) și `apps/server/.env.example`. Găsești tot cu `grep -rIi pretpilot . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git`. După schimbarea emailului demo, `db:seed:reset` trebuie să șteargă și vechiul utilizator.

### B. Scoaterea cumpărării automate → alerte în aplicație
Cerința: fără broker/cumpărare automată; utilizatorul primește **notificare în aplicație** când prețul unui produs urmărit ajunge la țintă sau sub ea.
1. **Scoate** routerul `packages/api/src/routers/broker.ts` (și `broker.test.ts`), pagina `apps/web/src/app/dashboard/broker/` + `apps/web/src/components/broker/`, linkul „Broker automat” din `components/dashboard/dashboard-nav.tsx`, comutatoarele „Cumpără automat” din `components/dashboard/{watchlist,product-detail,target-editor}.tsx`, textele din `components/landing/features.tsx` și `components/footer.tsx`, `brokerRouter` din `routers/index.ts`.
2. **Schema** (`packages/db/src/schema/auth.ts`, `commerce.ts`): elimină `user.broker*` și `shippingAddress`, `cart_items.autoBuyEnabled`; `orders.source` poate rămâne (enum). Aplici cu `bun run --cwd packages/db db:push` (va cere confirmare pentru coloanele șterse; conțin doar date demo).
3. **Notificări:** tabel nou `notifications` (id, userId, productId, type, title, body, price, store, readAt, createdAt). În `cart_items` adaugă `alertState` (`armed`/`triggered`). Un modul pur evaluează: pentru fiecare produs urmărit, cel mai mic preț în stoc din grupul de magazine (`connectedComponents` din `packages/api/src/lib/catalog.ts`) ≤ țintă ⇒ notificare o singură dată (`armed`→`triggered`), re-armare când prețul urcă peste țintă. Apelează evaluarea la sfârșitul tranzacției din `product.ingestPrice`.
4. **API:** `notifications.list`, `notifications.unreadCount`, `notifications.markRead`, `notifications.markAllRead`; `alerts.setTarget/clearTarget/list` (înlocuiesc `broker.setTarget` etc.).
5. **UI:** clopoțel în `components/header.tsx` cu număr de necitite (polling ~15 s cu TanStack Query), listă în dropdown, pagină `/dashboard/notificari`, toast la notificare nouă (sonner).
6. **Buton de demo** (doar pe produsele `demo-*`, doar în dev): scade prețul și rulează evaluarea, ca să poți declanșa o notificare în timpul prezentării.

### C. Protecția prețului, versiune minimă
Utilizatorul notează „Am cumpărat la X lei” (rând în `orders`: `unitPrice`, `purchasedAt`, `protectionExpiresAt` = +14 zile, `protectionStatus='monitoring'`). La fiecare actualizare de preț: dacă cel mai mic preț din grup < `unitPrice` în fereastra de 14 zile ⇒ notificare + text pentru cererea de rambursare (șablon în română: produs, data, prețul plătit, prețul nou, diferența, link). Pagină `/dashboard/protectie`.

### D. Reparații de siguranță rămase (runda a 2-a a fost oprită)
Verifică ce există cu grep; ce lipsește rămâne de făcut:
- `grep -n bodyLimit apps/server/src/index.ts` gol ⇒ **lipsește limita de corp la `/trpc/*`** (256 KB, răspuns 413). Prioritate mare.
- `errorFormatter` în `packages/api/src/index.ts` (mesaj generic la 500, fără `stack`) + `onError` care loghează eroarea reală pe server.
- Garda anti-„punte” în `product.ingestPrice`: dacă cererea are ean ȘI mpn valide, iar ambele există în rânduri diferite fără un rând comun, păstrează doar ean.
- `httpBatchLink({ maxItems: 20 })` în `apps/web/src/utils/trpc.ts` (serverul limitează loturile la 20).
- Limitator pentru `cart.optimize` (30/min) și gestionarea `429`/`Retry-After` în extensie.
- Extensie: limitele din `extension/src/logic.js` aliniate cu serverul (titlu ≤300, externalId ≤128, doar RON); regula `VARIANT_LIKE` lărgită pentru plăci video (`O8G`, `O16G`, `8GD`) în **ambele** locuri (`packages/api/src/lib/identifiers.ts` și `extension/src/extract.js`), cu vectorii din `model-code-vectors.json` (două copii identice).
- Documentate, nerezolvate: chei de client în spatele unui proxy / IPv6 /64, index `pg_trgm`, `statement_timeout`, plauzibilitatea prețurilor (prețurile sunt colectate de utilizatori).

### E. Hosting online (cum ai ales)
Browserul vorbește doar cu domeniul web: în `apps/web/next.config.ts` adaugă `rewrites()` care trimit `/trpc/*` și `/api/auth/*` către serverul Hono (cookie-uri first-party, fără probleme în Safari). Server: Dockerfile cu `oven/bun`, `PORT` din mediu, `NODE_ENV=production`, variabilele din `apps/server/.env.example` (`BETTER_AUTH_URL` = URL-ul web public). Baza: Neon (deja). Web pe Vercel (root `apps/web`, `NEXT_PUBLIC_SERVER_URL` = URL-ul web public). În spatele proxy-ului limitatorul vede IP-ul proxy-ului: citește IP-ul din `x-forwarded-for` doar când mediul declară proxy de încredere. **Ține varianta locală ca plan de rezervă** la prezentare.

## 4. Cum prezinți (≈5 minute)
1. **Problema (30 s):** același produs costă diferit în eMAG/PC Garage/Altex și prețurile se schimbă zilnic; nimeni nu le urmărește.
2. **Demo (2 min):** pagina de pornire → caută „casti” (fără diacritice) → pagina produsului: prețul în 3 magazine, cel mai mic, „Actualizat acum…” → conectare cu contul demo → dashboard: țintă setată → notificarea de preț (butonul de demo, când e gata) → coșul optimizat între magazine (economie față de un singur magazin).
3. **Extensia (1 min):** deschizi o pagină de produs reală (de exemplu SSD WD Green SN3000 2TB pe eMAG, apoi pe Altex): apare panoul „Același produs în alte magazine” și prețurile se actualizează prin utilizatori.
4. **Cum merge dedesubt (1 min):** potrivire după EAN/cod model, istoric de prețuri, optimizare combinatorie (căutare exactă + euristică), siguranță (validări, rate limit, fără scraping de pe server: `robots.txt` interzice).
5. **Ce urmează (30 s):** feed-uri de afiliere pentru acoperire, cupoane, protecția prețului, reputația contributorilor.

**Întrebări probabile:** *Este legal?* Nu facem scraping de pe server (robots.txt eMAG interzice `/product/`); datele vin de la utilizatori, prin extensie, și din feed-uri de afiliere (plan). *Cât de corecte sunt prețurile?* Marcăm prospețimea; după 24 h apare „preț posibil depășit”; potrivirea e conservatoare ca să nu confunde capacități diferite. *Cum câștigați bani?* Comision de afiliere la redirecționarea către magazin. *Ce împiedică prețurile false?* Cont obligatoriu pentru contribuții, validări și limite; următorul pas e reputația și coroborarea între utilizatori.

## 5. Prompt pentru un alt asistent AI
> Lucrezi pe proiectul Arbitrage (monorepo Bun + Turborepo: Next.js 16, Hono, tRPC, Drizzle 1.0 RC, Better Auth, Postgres/Neon, extensie Chrome MV3 în `extension/`). Citește `docs/NEXT_STEPS.md`, `docs/PROJECT_CONTEXT.md` și `README.md`. Răspunde-mi în română. Verifică înainte să afirmi că ceva merge (typecheck + teste). Nu face push, nu scrie în baza de date și nu comite fără acordul meu. Începe cu secțiunea 3 din `docs/NEXT_STEPS.md`, în ordinea A, B, C, D, E.

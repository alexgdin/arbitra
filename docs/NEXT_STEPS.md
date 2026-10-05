# Arbitra: ce e gata, ce a rămas și cum continui fără asistent

Starea după redenumirea repo-ului în `alexgdin/arbitra`. Ultima verificare completă: `tsc` curat în api/server/web/db; teste: **668** (packages/api), **72** (apps/server), **959** (extension), toate trec. Citește și `docs/PROJECT_CONTEXT.md` (capcane tehnice) și `README.md`.

## 1. Ce funcționează acum
- **Căutare publică fără cont** (`/cauta`), fără diacritice, cu comparare între magazine și prospețimea fiecărui preț (după 24 h prețul e marcat „posibil depășit”); **pagina publică de produs** (`/produs/[id]`) cu istoric pe magazin.
- **Potrivire între magazine** după EAN valid (cu cifra de control) sau cod de model normalizat (`mpn`), cu regulă conservatoare: variantele de capacitate nu se unesc. API public: `catalog.search`, `catalog.compare`, `catalog.lookup`.
- **Extensia de browser** (`extension/`, Chrome MV3, fără build): extrage prețul pe eMAG/PC Garage/Altex, îl trimite doar dacă ești conectat și arată panoul de comparare. Validată pe pagini reale ale celor 3 magazine. Se încarcă din `chrome://extensions` → Mod dezvoltator → „Încarcă nepachetat” → folderul `extension/`.
- **Alerte de preț în aplicație** (`/dashboard/broker`, tab-ul „Alerte de preț”): setezi un preț țintă, iar clopoțelul din antet (verificare la 15 s) și un toast te anunță când prețul ajunge la țintă sau sub ea. Cumpărarea automată a fost scoasă.
- **Mod demo** (doar când `NODE_ENV !== "production"`): cardul „Mod demo” → „Simulează scăderea prețului” declanșează o notificare live în timpul prezentării.
- **Coș optimizat** (`/dashboard/cart`): împarte coșul între magazine ca totalul cu transport să fie minim (căutare exactă pentru coșuri mici, euristică peste).
- **Încredere și legal:** pagini `/termeni`, `/confidentialitate`, `/cookies` (operator Hrongobar, hrongobar@gmail.com), banner de cookie-uri, acceptarea termenilor la înregistrare.
- **Protecții:** limite de cereri (`catalog.*` 90/min, ingestie 120/min, `cart.optimize` 30/min, cu `Retry-After` respectat de extensie), limită de corp 256 KB pe `/trpc/*`, loturi tRPC de cel mult 20, mesaje de eroare generice pentru 500, magazine doar `emag|pcgarage|altex`, URL doar pe domeniul magazinului, identificatorii nu se suprascriu, filtru pentru prețuri aberante.
- **Baza de date:** Postgres pe Neon, conectată prin WebSocket (`@neondatabase/serverless`), deci merge și pe rețele care blochează portul 5432. `db:push` are nevoie în continuare de portul 5432.

## 2. Pornire rapidă
```
bun install
bun run dev                # web 3001, server 3000
bun run db:seed --yes      # date demo (utilizator demo@arbitra.test, parola e DEMO_PASSWORD în apps/server/src/scripts/seed.ts)
```
Fișiere de mediu: copiază `apps/server/.env.example` și `apps/web/.env.example` în `.env` (valorile reale NU se comit). Prima deschidere a unei pagini în modul dezvoltare durează câteva secunde (se compilează); deschide paginile o dată înainte de demo.

## 3. Ce NU e gata (în ordinea priorității)

### A. Hosting online
Browserul vorbește doar cu domeniul web: în `apps/web/next.config.ts` adaugă `rewrites()` care trimit `/trpc/*` și `/api/auth/*` către serverul Hono (cookie-uri first-party, fără probleme în Safari). Server: Dockerfile cu `oven/bun`, `PORT` din mediu, `NODE_ENV=production`, variabilele din `apps/server/.env.example` (`BETTER_AUTH_URL` = URL-ul web public). Baza: Neon (deja). Web pe Vercel (root `apps/web`, `NEXT_PUBLIC_SERVER_URL` = URL-ul web public). În spatele proxy-ului limitatorul vede IP-ul proxy-ului: citește IP-ul din `x-forwarded-for` doar când mediul declară proxy de încredere. În producție butonul de demo nu apare. **Ține varianta locală ca plan de rezervă** la prezentare.

### B. Protecția prețului, versiune minimă
Utilizatorul notează „Am cumpărat la X lei” (rând în `orders`: `unitPrice`, `purchasedAt`, `protectionExpiresAt` = +14 zile, `protectionStatus='monitoring'`). La fiecare actualizare de preț: dacă cel mai mic preț din grup < `unitPrice` în fereastra de 14 zile ⇒ notificare + text pentru cererea de rambursare (șablon în română: produs, data, prețul plătit, prețul nou, diferența, link). Pagină `/dashboard/protectie`.

### C. Surse de prețuri și cupoane
- Feed-uri de afiliere (de exemplu 2Performant, Profitshare) pentru prețuri actualizate zilnic, dintr-o sursă oficială, fără scraping.
- Cupoane aplicate din extensie la finalizarea comenzii.
- Reputația contributorilor: prețuri confirmate de mai mulți utilizatori.

### D. Curățenie tehnică
- Endpoint-urile pentru prețul țintă stau încă în routerul `broker` (nume vechi), iar `cart_items.autoBuyEnabled` există în schemă, mereu `false`. Se pot muta în `alerts` și șterge coloana (`db:push` cere confirmare).
- Au rămas intenționat identificatorii interni ai extensiei: prefixul mesajelor `pretpilot:*`, globalele `PretPilotExtract`/`PretPilotOverlay`.
- Documentate, nerezolvate: limitator comun între mai multe servere (acum e în memorie, per proces), chei de client în spatele unui proxy / IPv6 /64, index `pg_trgm` pentru căutare, `statement_timeout`.

## 4. Cum prezinți (3-4 minute)
1. **Problema (30 s):** același SSD WD Green SN3000 2TB: eMAG 1.490,77 lei, Altex 1.199,99 lei (diferență 290,78 lei), prețuri văzute pe 4 octombrie 2026.
2. **Soluția (20 s):** căutare fără cont, istoric și prospețime, alertă la prețul țintă, coș optimizat. Arbitra te anunță, nu cumpără în locul tău.
3. **Demo (90 s):** caută „casti” → produsul în 3 magazine → caută „wds200t4g0e” (SSD-ul real) → conectare cu contul demo → „Alerte de preț” → „Simulează scăderea prețului” (notificarea apare în circa 15 s, cu pagina deschisă) → „Coș și optimizare” → „Optimizează coșul” → (opțional) extensia pe pagina reală eMAG.
4. **Cum merge (45 s):** potrivire după EAN/cod de model, extensie → API → potrivire → Arbitra, fără scraping de pe server, protecții.
5. **Ce urmează (15 s):** feed-uri de afiliere, protecția prețului, cupoane; model de business: comision de afiliere.

**Întrebări probabile:** *Este legal?* Nu facem scraping de pe server; datele vin de la utilizatori, prin extensie, iar pe viitor din feed-uri de afiliere. *Cât de corecte sunt prețurile?* Marcăm prospețimea; după 24 h apare „posibil depășit”; potrivirea e conservatoare. *Cum câștigați bani?* Comision de afiliere. *Ce împiedică prețurile false?* Cont obligatoriu pentru contribuții, validări, limite, filtru pentru prețuri aberante; următorul pas e reputația. *De ce nu cumpără automat?* Decizia rămâne la utilizator; plata automată ar cere date de card și răspundere.

## 5. Prompt pentru un alt asistent AI
> Lucrezi pe proiectul Arbitra (monorepo Bun + Turborepo: Next.js 16, Hono, tRPC, Drizzle 1.0 RC, Better Auth, Postgres/Neon prin WebSocket, extensie Chrome MV3 în `extension/`). Citește `docs/NEXT_STEPS.md`, `docs/PROJECT_CONTEXT.md` și `README.md`. Răspunde-mi în română. Verifică înainte să afirmi că ceva merge (typecheck + teste). Nu face push, nu scrie în baza de date și nu comite fără acordul meu. Începe cu secțiunea 3 din `docs/NEXT_STEPS.md`, în ordinea A, B, C, D.

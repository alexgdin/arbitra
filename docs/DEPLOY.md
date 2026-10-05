# Deploy pe Vercel (planul Hobby, gratuit)

Arbitra se publică în **două proiecte Vercel** din același repo GitHub:

| Proiect | Root Directory | Ce rulează |
|---|---|---|
| `arbitra-api` | `apps/server` | API-ul Hono (`/trpc`, `/api/auth`), detectat automat de Vercel |
| `arbitra` | `apps/web` | Site-ul Next.js |

Browserul vorbește **doar cu domeniul site-ului**: `apps/web/next.config.ts` trimite `/trpc/*` și `/api/auth/*` către API prin rewrites (când `API_ORIGIN` e setat). Așa cookie-urile de autentificare sunt first-party, iar login-ul merge și în Safari/iOS și în verificarea sesiunii din `/dashboard`. Fără rewrites, cu site-ul și API-ul pe două domenii `*.vercel.app`, login-ul nu ar funcționa.

Ambele proiecte au `vercel.json`: instalarea se face cu Bun 1.4.2 prin `npx --yes bun@1.4.2 install` (aceeași versiune care a scris `bun.lock`), iar funcțiile rulează în `fra1` (Frankfurt), lângă baza Neon.

## 1. Proiectul API (primul)
1. vercel.com → **Add New… → Project** → importă `alexgdin/arbitra`.
2. **Project Name:** `arbitra-api`. **Root Directory:** `apps/server` (Framework: Hono, detectat automat). Lasă bifat „Include files outside the root directory”.
3. **Environment Variables:**
   - `DATABASE_URL`: același ca în `apps/server/.env` (de preferat varianta `-pooler` de la Neon).
   - `BETTER_AUTH_SECRET`: un șir nou, de cel puțin 32 de caractere (de exemplu `bun -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
   - `BETTER_AUTH_URL`: `https://arbitra.vercel.app` (domeniul **site-ului**, fără `/` la final).
   - `CORS_ORIGIN`: `https://arbitra.vercel.app` (tot domeniul site-ului).
   - `NODE_ENV`: `production`.
4. **Deploy.** La final, verifică `https://arbitra-api.vercel.app/` → trebuie să răspundă `OK`.

## 2. Proiectul site
1. **Add New… → Project** → același repo.
2. **Project Name:** `arbitra`. **Root Directory:** `apps/web` (Framework: Next.js).
3. **Environment Variables:**
   - `NEXT_PUBLIC_SERVER_URL`: `https://arbitra.vercel.app` (domeniul **site-ului**, nu al API-ului).
   - `API_ORIGIN`: `https://arbitra-api.vercel.app` (domeniul de producție al API-ului).
   - `NODE_ENV`: `production`.
4. **Deploy.**

Dacă numele `arbitra` e deja luat pe Vercel, domeniul va fi altul (de exemplu `arbitra-xyz.vercel.app`). Atunci pune domeniul real în `BETTER_AUTH_URL`, `CORS_ORIGIN` și `NEXT_PUBLIC_SERVER_URL`, apoi **Redeploy** la ambele proiecte. Orice schimbare de variabile cere un redeploy.

## 3. Verificare
- `https://arbitra.vercel.app/cauta?q=wds200t4g0e` arată SSD-ul (Altex față de eMAG).
- Înregistrare / conectare → ajungi în `/dashboard` și rămâi conectat după refresh.
- Extensia: în setările ei, adresa serverului devine `https://arbitra.vercel.app`.

## De știut
- **În producție nu există „Mod demo”** (butonul „Simulează scăderea prețului”): e dezactivat când `NODE_ENV=production`.
- **Hobby e doar pentru uz necomercial.** Pentru venituri (de exemplu linkuri de afiliere) e nevoie de planul Pro.
- Limitarea cererilor e în memorie, pe fiecare instanță de funcție, deci pe Vercel e doar o protecție slabă.
- `db:push` nu rulează la deploy; schema e deja în Neon. Rulează-l manual doar când se schimbă schema, de pe o rețea cu portul 5432 deschis.
- Local nu se schimbă nimic: `bun run dev` folosește în continuare varlock și `.env`.

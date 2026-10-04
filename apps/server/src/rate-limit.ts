// Limitator de cereri cu fereastră fixă, în memorie. Potrivit pentru o singură instanță de server;
// cu mai multe instanțe, contoarele ar trebui ținute într-un depozit comun (de exemplu Redis).
// La final: numărarea apelurilor tRPC dintr-o cerere (la fel ca tRPC, nu ca Hono), middleware-ul care le limitează,
// plafonul mărimii corpului unei cereri /trpc și jurnalul erorilor interne.

import type { TRPCError } from "@trpc/server";
import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

export type RateLimiterOptions = {
  // Câte apeluri sunt permise per cheie într-o fereastră
  limit: number;
  windowMs: number;
  // Plafonul de chei urmărite în același timp; peste el se elimină fereastra care expiră prima
  maxKeys?: number;
  // Ceasul, injectabil în teste
  now?: () => number;
};

const DEFAULT_MAX_KEYS = 10_000;

export type RateLimitResult = {
  allowed: boolean;
  // Secunde până se deschide o nouă fereastră; 0 când cererea este permisă
  retryAfterSeconds: number;
};

type Bucket = { count: number; resetAt: number };

export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = DEFAULT_MAX_KEYS,
  now = Date.now,
}: RateLimiterOptions) {
  const buckets = new Map<string, Bucket>();
  let nextSweepAt = now() + windowMs;

  // Ferestrele expirate se șterg o dată pe fereastră, ca Map-ul să nu crească la nesfârșit.
  function sweep(current: number) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= current) {
        buckets.delete(key);
      }
    }
    nextSweepAt = current + windowMs;
  }

  return {
    // `cost` este numărul de apeluri pe care le face cererea (un apel grupat are mai multe).
    check(key: string, cost = 1): RateLimitResult {
      const current = now();
      if (current >= nextSweepAt) {
        sweep(current);
      }

      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= current) {
        // Map păstrează ordinea inserării: după ștergere, cheia nouă ajunge la coadă, deci prima
        // cheie este fereastra care expiră prima. Un atacator cu multe adrese nu poate umfla memoria.
        buckets.delete(key);
        if (buckets.size >= maxKeys) {
          const oldest = buckets.keys().next();
          if (!oldest.done) {
            buckets.delete(oldest.value);
          }
        }
        bucket = { count: 0, resetAt: current + windowMs };
        buckets.set(key, bucket);
      }

      if (bucket.count + cost > limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((bucket.resetAt - current) / 1000)
          ),
        };
      }

      bucket.count += cost;
      return { allowed: true, retryAfterSeconds: 0 };
    },

    // Câte chei sunt urmărite acum (ferestre încă neșterse).
    get size(): number {
      return buckets.size;
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

const TRPC_ENDPOINT = "/trpc";

// Cel mult atâtea proceduri într-un apel tRPC grupat (dashboard-ul grupează în jur de 8). Se dă lui
// tRPC ca `maxBatchSize`: peste limită răspunde cu BAD_REQUEST, fără să execute nimic. Clientul web
// (apps/web/src/utils/trpc.ts) are aceeași valoare în `maxItems`, ca să nu depășească niciodată limita.
export const MAX_TRPC_BATCH_SIZE = 20;

// Același mod de a tăia slash-urile ca în fetchRequestHandler din @trpc/server (un slash de la fiecare capăt).
function trimSlashes(path: string): string {
  const withoutStart = path.startsWith("/") ? path.slice(1) : path;
  return withoutStart.endsWith("/") ? withoutStart.slice(0, -1) : withoutStart;
}

// Procedurile pe care le rezolvă tRPC pentru o cerere, citite exact ca în fetchRequestHandler și resolveResponse
// din @trpc/server: calea din `new URL(url).pathname` (care rezolvă segmentele "." și "..", și pe cele scrise
// "%2e"), fără primele caractere cât endpoint-ul, apoi decodificată și despărțită la virgulă (apel grupat).
// c.req.path din Hono NU e potrivită: nu rezolvă "." și "..", deci "/trpc/./catalog.search" ar scăpa de limită,
// iar tRPC taie lungimea endpoint-ului fără să verifice prefixul ("/trpc/../abcd/catalog.search" rezolvă tot
// catalog.search). `requestUrl` este adresa completă a cererii (c.req.url).
export function trpcProcedures(requestUrl: string): string[] {
  let pathname: string;
  try {
    pathname = new URL(requestUrl).pathname;
  } catch {
    return [];
  }

  const rawPath = trimSlashes(
    trimSlashes(pathname).slice(trimSlashes(TRPC_ENDPOINT).length)
  );
  try {
    return decodeURIComponent(rawPath).split(",");
  } catch {
    // codificare invalidă: tRPC o respinge, dar noi o numărăm așa cum a sosit, ca să nu scape nimic
    return rawPath.split(",");
  }
}

// Câte proceduri din spațiul de nume (de exemplu "catalog") sunt în cerere. Se numără fiecare apariție, ca nici
// prefixarea cu altă procedură, nici repetarea aceleiași proceduri într-un apel grupat să nu ocolească limita.
export function countTrpcNamespaceCalls(
  requestUrl: string,
  namespace: string
): number {
  return trpcProcedures(requestUrl).filter((procedure) =>
    procedure.startsWith(`${namespace}.`)
  ).length;
}

// Câte apeluri ale unei proceduri anume (de exemplu "product.ingestPrice") sunt în cerere.
export function countTrpcProcedureCalls(
  requestUrl: string,
  procedure: string
): number {
  return trpcProcedures(requestUrl).filter((name) => name === procedure).length;
}

export type TrpcRateLimitOptions = {
  limiter: RateLimiter;
  // Câte apeluri ale cererii intră sub această limită; 0 înseamnă că nu o privește
  countCalls: (requestUrl: string) => number;
  // Mesajul din răspunsul 429, în română
  message: string;
  // Cheia clientului; vezi nota din index.ts despre reverse proxy
  clientKey: (c: Context) => string;
};

// Middleware Hono pentru /trpc/*: numără apelurile cererii (apelul grupat plătește câte unul pe procedură) și
// răspunde 429 când clientul a depășit limita.
export function trpcRateLimit({
  limiter,
  countCalls,
  message,
  clientKey,
}: TrpcRateLimitOptions): MiddlewareHandler {
  return async (c, next) => {
    const calls = countCalls(c.req.url);
    if (calls === 0) {
      return next();
    }

    const { allowed, retryAfterSeconds } = limiter.check(clientKey(c), calls);
    if (allowed) {
      return next();
    }

    // Aceeași formă ca o eroare tRPC, ca aplicația web să afle codul și să arate mesajul.
    return c.json(
      {
        error: {
          message,
          code: -32_029,
          data: { code: "TOO_MANY_REQUESTS", httpStatus: 429 },
        },
      },
      429,
      { "Retry-After": String(retryAfterSeconds) }
    );
  };
}

// Corpul unei cereri /trpc: cel mai mare apel real este un lot de 20 de prețuri (sub 100 KiB chiar cu toate
// câmpurile la maxim), deci 256 KiB are loc cu rezervă. Fără plafon, un cont ar putea trimite sute de MiB de JSON
// imbricat și ar bloca serverul (un singur fir) cât timp îl parsează.
export const MAX_TRPC_BODY_BYTES = 256 * 1024;

// Middleware Hono pentru /trpc/*, înaintea limitatoarelor și a lui tRPC. Hono respinge cererea după Content-Length,
// fără să citească corpul; fără Content-Length (transfer chunked) citește fluxul și se oprește când trece de plafon.
// Răspunsul are forma unei erori tRPC, ca aplicația web să afle codul și să arate mesajul.
export function trpcBodyLimit(): MiddlewareHandler {
  return bodyLimit({
    maxSize: MAX_TRPC_BODY_BYTES,
    onError: (c) =>
      c.json(
        {
          error: {
            message: "Cerere prea mare.",
            code: -32_013,
            data: { code: "PAYLOAD_TOO_LARGE", httpStatus: 413 },
          },
        },
        413
      ),
  });
}

// Pentru `onError` din trpcServer: clientul primește doar un mesaj generic la erorile interne, deci cauza reală
// (mesajul, de exemplu "Failed query: ..." de la Drizzle) și procedura rămân aici, în jurnalul serverului. Se scriu
// doar codul, calea și mesajul: nu corpul cererii, nu antetele și nu cookie-urile.
export function logTrpcError({
  error,
  path,
}: {
  error: TRPCError;
  path: string | undefined;
}): void {
  if (error.code === "INTERNAL_SERVER_ERROR") {
    console.error("Eroare tRPC", {
      code: error.code,
      path: path ?? "necunoscută",
      message: error.message,
    });
  }
}

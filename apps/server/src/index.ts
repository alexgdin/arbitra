import { trpcServer } from "@hono/trpc-server";
import { appRouter } from "@my-better-t-app/api/routers/index";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { createContext } from "./context";
import { ENV } from "./env.server";
import {
  MAX_TRPC_BATCH_SIZE,
  countTrpcNamespaceCalls,
  countTrpcProcedureCalls,
  createRateLimiter,
  logTrpcError,
  trpcBodyLimit,
  trpcRateLimit,
} from "./rate-limit";
import { auth } from "./services";

// Catalogul public (căutare și comparare) nu cere cont, deci îl protejăm de abuz: 90 de apeluri pe minut per client.
const catalogLimiter = createRateLimiter({ limit: 90, windowMs: 60_000 });
// Orice cont (și extensia) poate trimite prețuri, deci și scrierea în catalog are limită: 120 de apeluri pe minut per client.
const ingestLimiter = createRateLimiter({ limit: 120, windowMs: 60_000 });
// cart.optimize cere cont, dar face 3 interogări și citește până la 600 de rânduri: 30 de apeluri pe minut per client.
const optimizeLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

// Cheia este adresa conexiunii. În spatele unui reverse proxy ea ar fi adresa proxy-ului pentru toți clienții,
// deci cheia trebuie luată dintr-un header de redirecționare de încredere (X-Forwarded-For setat de proxy).
// Pe Vercel nu există conexiunea Bun, iar platforma pune adresa clientului în X-Real-IP / X-Forwarded-For.
// Nu importăm „hono/bun”: modulul citește globalul Bun la încărcare și oprește procesul sub Node.
type BunServerLike = { requestIP?: (request: Request) => { address: string } | null };

function clientKey(c: Context): string {
  if (process.env.VERCEL) {
    const forwarded = c.req.header("x-real-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0];
    return forwarded?.trim() || "unknown";
  }
  // Sub Bun, c.env este serverul (sau îl conține), ca în getConnInfo din hono/bun.
  const env = c.env as ({ server?: BunServerLike } & BunServerLike) | undefined;
  const server = env && "server" in env ? env.server : env;
  return server?.requestIP?.(c.req.raw)?.address ?? "unknown";
}

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: ENV.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", async (c) => auth.handler(c.req.raw));

// Primul pe /trpc, înaintea limitatoarelor: o cerere prea mare se respinge cu 413 fără să fie citită sau parsată.
app.use("/trpc/*", trpcBodyLimit());

// Fiecare procedură din catalog dintr-un apel grupat (/trpc/catalog.search,product.history) se numără separat.
app.use(
  "/trpc/*",
  trpcRateLimit({
    limiter: catalogLimiter,
    countCalls: (requestUrl) => countTrpcNamespaceCalls(requestUrl, "catalog"),
    message:
      "Prea multe căutări într-un timp scurt. Încearcă din nou peste câteva secunde.",
    clientKey,
  }),
);

// La fel pentru trimiterea de prețuri: fiecare apel product.ingestPrice dintr-un apel grupat se numără separat.
app.use(
  "/trpc/*",
  trpcRateLimit({
    limiter: ingestLimiter,
    countCalls: (requestUrl) =>
      countTrpcProcedureCalls(requestUrl, "product.ingestPrice"),
    message:
      "Prea multe prețuri trimise într-un timp scurt. Încearcă din nou peste câteva secunde.",
    clientKey,
  }),
);

// Și optimizarea coșului: fiecare apel cart.optimize dintr-un apel grupat se numără separat, cu aceeași regulă.
app.use(
  "/trpc/*",
  trpcRateLimit({
    limiter: optimizeLimiter,
    countCalls: (requestUrl) =>
      countTrpcProcedureCalls(requestUrl, "cart.optimize"),
    message:
      "Prea multe optimizări de coș într-un timp scurt. Încearcă din nou peste câteva secunde.",
    clientKey,
  }),
);

app.use(
  "/trpc/*",
  trpcServer({
    endpoint: "/trpc",
    router: appRouter,
    // Un apel grupat cu mai multe proceduri decât limita primește BAD_REQUEST din partea lui tRPC.
    maxBatchSize: MAX_TRPC_BATCH_SIZE,
    // Clientul primește un mesaj generic la erorile interne; cauza reală rămâne în jurnalul serverului.
    onError: logTrpcError,
    createContext: (_opts, context) => {
      return createContext({ context });
    },
  }),
);

app.get("/", (c) => {
  return c.text("OK");
});

export default app;

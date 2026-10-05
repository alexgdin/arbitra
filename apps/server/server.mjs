// Intrarea pe Vercel: API-ul deja compilat de tsdown (`bun run build` → dist/index.mjs), cu pachetele din
// workspace incluse și cu importuri care au extensii, cum le cere Node. Local, `bun run dev` pornește src/index.ts.
import "hono";

export { default } from "./dist/index.mjs";

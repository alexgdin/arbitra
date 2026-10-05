import { z } from "zod";

// Pe Vercel variabilele vin din setările proiectului, iar varlock nu își poate rula CLI-ul la pornirea
// funcției (fără .env.schema în pachetul ei). Acolo le citim direct din process.env și le validăm cu aceleași
// reguli ca în apps/server/.env.schema. Local și în teste rămâne varlock (.env.schema + .env).
const DeployedEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  CORS_ORIGIN: z.url(),
  DATABASE_URL: z.string().min(1),
});

type ServerEnv = z.infer<typeof DeployedEnvSchema>;

async function loadEnv(): Promise<Readonly<ServerEnv>> {
  if (process.env.VERCEL) {
    return DeployedEnvSchema.parse(process.env);
  }
  await import("varlock/auto-load");
  const { ENV } = await import("./env");
  return ENV;
}

export const ENV = await loadEnv();

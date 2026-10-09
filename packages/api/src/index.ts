import { initTRPC, TRPCError } from "@trpc/server";
import type { TRPCDefaultErrorShape } from "@trpc/server";

import type { Context } from "./context";

export const INTERNAL_ERROR_MESSAGE = "Eroare internă. Încearcă din nou.";

// Forma erorii trimise clientului. O eroare internă (de exemplu "Failed query: <SQL> params: ..." de la
// Drizzle) își pierde mesajul, care ar scurge SQL și valori, iar stiva (căi absolute de pe server) nu se
// trimite niciodată. Mesajele celorlalte coduri (BAD_REQUEST, UNAUTHORIZED, NOT_FOUND...) rămân.
export function hideInternals(
  shape: TRPCDefaultErrorShape
): TRPCDefaultErrorShape {
  const { stack: _stack, ...data } = shape.data;
  return {
    ...shape,
    message:
      shape.data.code === "INTERNAL_SERVER_ERROR"
        ? INTERNAL_ERROR_MESSAGE
        : shape.message,
    data,
  };
}

export const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    if (shape.data.code === "INTERNAL_SERVER_ERROR") {
      // mesajul real și stiva rămân doar în log-ul serverului
      console.error(error);
    }
    return hideInternals(shape);
  },
});

export const router = t.router;

export const baseProcedure = t.procedure.use(({ ctx, next }) => {
  // Aceeași setare ca în site și autentificare; implicit aplicația funcționează normal.
  const maintenanceActive = process.env.MAINTENANCE_MODE === "true";
  if (ctx.session?.user.role !== "admin" && maintenanceActive) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Site-ul este în mentenanță. Încearcă din nou mai târziu.",
    });
  }
  return next();
});

export const publicProcedure = baseProcedure;

export const protectedProcedure = baseProcedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      cause: "No session",
    });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

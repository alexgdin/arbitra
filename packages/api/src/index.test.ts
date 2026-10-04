import { describe, expect, spyOn, test } from "bun:test";

import type { Database } from "@my-better-t-app/db";
import { initTRPC, TRPCError } from "@trpc/server";
import type { TRPCDefaultErrorShape } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { z } from "zod";

import { hideInternals, INTERNAL_ERROR_MESSAGE, protectedProcedure, t } from "./index";

const SQL_ERROR =
  'Failed query: select "id", "title" from "products" where "ean" = $1 params: 718037904610';
const STACK = `Error: ${SQL_ERROR}\n    at query (C:\\Users\\Alex\\my-better-t-app\\node_modules\\drizzle-orm\\pg-core\\session.js:42:11)`;

function shape(
  code: TRPCDefaultErrorShape["data"]["code"],
  message: string,
  overrides: Partial<TRPCDefaultErrorShape["data"]> = {}
): TRPCDefaultErrorShape {
  return {
    message,
    code: -32_603,
    data: { code, httpStatus: 500, path: "product.ingestPrice", stack: STACK, ...overrides },
  };
}

describe("hideInternals", () => {
  test("replaces the message of an internal error with a generic one in Romanian", () => {
    const result = hideInternals(shape("INTERNAL_SERVER_ERROR", SQL_ERROR));

    expect(result.message).toBe("Eroare internă. Încearcă din nou.");
    expect(INTERNAL_ERROR_MESSAGE).toBe("Eroare internă. Încearcă din nou.");
    expect(JSON.stringify(result)).not.toContain("Failed query");
    expect(JSON.stringify(result)).not.toContain("718037904610");
  });

  test("always removes the stack, for every code", () => {
    for (const code of [
      "INTERNAL_SERVER_ERROR",
      "BAD_REQUEST",
      "UNAUTHORIZED",
      "NOT_FOUND",
      "TOO_MANY_REQUESTS",
    ] as const) {
      const result = hideInternals(shape(code, "message"));

      expect("stack" in result.data).toBe(false);
      expect(JSON.stringify(result)).not.toContain("C:\\\\Users");
    }
  });

  test("keeps the message of every other code", () => {
    for (const [code, message] of [
      ["BAD_REQUEST", '[{"code":"too_big","path":["price"],"message":"Too big"}]'],
      ["UNAUTHORIZED", "Authentication required"],
      ["NOT_FOUND", "Product not found"],
      ["TOO_MANY_REQUESTS", "Prea multe cereri"],
      ["FORBIDDEN", "Nu ai voie"],
    ] as const) {
      expect(hideInternals(shape(code, message)).message).toBe(message);
    }
  });

  test("keeps the code, the status and the path", () => {
    const result = hideInternals(
      shape("NOT_FOUND", "Product not found", { httpStatus: 404, path: "catalog.compare" })
    );

    expect(result).toEqual({
      message: "Product not found",
      code: -32_603,
      data: { code: "NOT_FOUND", httpStatus: 404, path: "catalog.compare" },
    });
  });

  test("does not change the shape it was given", () => {
    const original = shape("INTERNAL_SERVER_ERROR", SQL_ERROR);
    const copy = structuredClone(original);

    hideInternals(original);

    expect(original).toEqual(copy);
  });

  test("handles an error without a stack or a path", () => {
    const result = hideInternals({
      message: SQL_ERROR,
      code: -32_603,
      data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
    });

    expect(result.data).toEqual({ code: "INTERNAL_SERVER_ERROR", httpStatus: 500 });
    expect(result.message).toBe(INTERNAL_ERROR_MESSAGE);
  });
});

describe("error formatter of the router", () => {
  const router = t.router({
    boom: t.procedure.query(() => {
      throw new Error(SQL_ERROR);
    }),
    explicitInternal: t.procedure.query(() => {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save product" });
    }),
    missing: t.procedure.query(() => {
      throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
    }),
    typed: t.procedure.input(z.object({ n: z.number().max(5) })).query(({ input }) => input.n),
    secret: protectedProcedure.query(() => "secret"),
  });

  async function call(path: string) {
    const response = await fetchRequestHandler({
      endpoint: "/trpc",
      req: new Request(`http://localhost/trpc/${path}`),
      router,
      createContext: () => ({ session: null, db: {} as Database }),
    });
    const body = (await response.json()) as {
      error: { message: string; data: Record<string, unknown> };
    };
    return { status: response.status, body, text: JSON.stringify(body) };
  }

  function silenceLog() {
    return spyOn(console, "error").mockImplementation(() => undefined);
  }

  test("would send the stack and the SQL without the formatter, which this test depends on", async () => {
    const plain = initTRPC.create();
    const plainRouter = plain.router({
      boom: plain.procedure.query(() => {
        throw new Error(SQL_ERROR);
      }),
    });

    const response = await fetchRequestHandler({
      endpoint: "/trpc",
      req: new Request("http://localhost/trpc/boom"),
      router: plainRouter,
      createContext: () => ({}),
    });
    const body = (await response.json()) as { error: { message: string; data: { stack?: string } } };

    expect(body.error.message).toBe(SQL_ERROR);
    expect(body.error.data.stack).toContain(SQL_ERROR);
  });

  test("sends a generic message, with no SQL, parameters or stack, for an unexpected error", async () => {
    const log = silenceLog();
    try {
      const { status, body, text } = await call("boom");

      expect(status).toBe(500);
      expect(body.error.message).toBe(INTERNAL_ERROR_MESSAGE);
      expect(body.error.data.code).toBe("INTERNAL_SERVER_ERROR");
      expect(body.error.data.stack).toBeUndefined();
      expect(text).not.toContain("Failed query");
      expect(text).not.toContain("718037904610");
      expect(text).not.toContain("drizzle");
      expect(text).not.toContain("node_modules");
    } finally {
      log.mockRestore();
    }
  });

  test("logs the real error on the server, once", async () => {
    const log = silenceLog();
    try {
      await call("boom");

      expect(log).toHaveBeenCalledTimes(1);
      const logged = log.mock.calls[0]?.[0] as Error;
      expect(logged.message).toContain(SQL_ERROR);
    } finally {
      log.mockRestore();
    }
  });

  test("hides the message of an internal error that was thrown on purpose, too", async () => {
    const log = silenceLog();
    try {
      const { status, body } = await call("explicitInternal");

      expect(status).toBe(500);
      expect(body.error.message).toBe(INTERNAL_ERROR_MESSAGE);
      expect(body.error.data.stack).toBeUndefined();
    } finally {
      log.mockRestore();
    }
  });

  test("keeps the message of the other errors, without the stack, and logs nothing", async () => {
    const log = silenceLog();
    try {
      const missing = await call("missing");
      const unauthorized = await call("secret");
      const invalid = await call(`typed?input=${encodeURIComponent(JSON.stringify({ n: 9 }))}`);

      expect(missing.status).toBe(404);
      expect(missing.body.error.message).toBe("Product not found");
      expect(unauthorized.status).toBe(401);
      expect(unauthorized.body.error.message).toBe("Authentication required");
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.message).toContain("too_big");
      for (const result of [missing, unauthorized, invalid]) {
        expect(result.body.error.data.stack).toBeUndefined();
        expect(result.text).not.toContain("node_modules");
      }
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});

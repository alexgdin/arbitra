import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import type { Session } from "@my-better-t-app/auth";
import type { Database } from "@my-better-t-app/db";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { protectedProcedure, publicProcedure, t } from "./index";

const originalMode = process.env.MAINTENANCE_MODE;
const db = {} as Database;

function session(role?: string): Session {
  return { user: { id: "user-1", role } } as Session;
}

describe("maintenance access", () => {
  beforeEach(() => {
    process.env.MAINTENANCE_MODE = "false";
  });

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.MAINTENANCE_MODE;
    } else {
      process.env.MAINTENANCE_MODE = originalMode;
    }
  });

  const router = t.router({
    catalog: publicProcedure.query(() => "public result"),
    account: protectedProcedure.query(({ ctx }) => ctx.session.user.id),
  });
  const createCaller = t.createCallerFactory(router);

  test("public access works when the setting is absent", async () => {
    delete process.env.MAINTENANCE_MODE;

    expect(await createCaller({ db, session: null }).catalog()).toBe("public result");
  });

  test("false allows visitors and ordinary signed-in users", async () => {
    expect(await createCaller({ db, session: null }).catalog()).toBe("public result");
    expect(await createCaller({ db, session: session("user") }).account()).toBe("user-1");
  });

  test("false keeps authentication required for private access", async () => {
    await expect(createCaller({ db, session: null }).account()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test.each([
    { name: "visitor", userSession: null },
    { name: "ordinary user", userSession: session("user") },
    { name: "legacy user without a role", userSession: session() },
  ])("true blocks public and private access for $name", async ({ userSession }) => {
    process.env.MAINTENANCE_MODE = "true";
    const caller = createCaller({ db, session: userSession });

    for (const call of [() => caller.catalog(), () => caller.account()]) {
      await expect(call()).rejects.toMatchObject({
        code: "SERVICE_UNAVAILABLE",
        message: "Site-ul este în mentenanță. Încearcă din nou mai târziu.",
      });
    }
  });

  test("true lets administrators use public and private procedures", async () => {
    process.env.MAINTENANCE_MODE = "true";
    const caller = createCaller({ db, session: session("admin") });

    expect(await caller.catalog()).toBe("public result");
    expect(await caller.account()).toBe("user-1");
  });

  test("a blocked request returns HTTP 503 with a usable Romanian message", async () => {
    process.env.MAINTENANCE_MODE = "true";
    const response = await fetchRequestHandler({
      endpoint: "/trpc",
      req: new Request("http://localhost/trpc/catalog"),
      router,
      createContext: () => ({ db, session: null }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: {
        message: "Site-ul este în mentenanță. Încearcă din nou mai târziu.",
        data: { code: "SERVICE_UNAVAILABLE", httpStatus: 503 },
      },
    });
  });

  test("disabling maintenance restores access to an existing router", async () => {
    const caller = createCaller({ db, session: null });
    process.env.MAINTENANCE_MODE = "true";
    await expect(caller.catalog()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });

    process.env.MAINTENANCE_MODE = "false";
    expect(await caller.catalog()).toBe("public result");
  });
});

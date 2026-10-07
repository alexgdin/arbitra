import { createAuth } from "@my-better-t-app/auth";
import { createDb } from "@my-better-t-app/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
const maintenanceActive = process.env.MAINTENANCE_MODE === "true";

export const auth = createAuth(ENV, db, [], maintenanceActive);

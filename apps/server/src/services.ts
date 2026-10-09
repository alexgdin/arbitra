import { createAuth } from "@my-better-t-app/auth";
import { createDb } from "@my-better-t-app/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
const maintenanceActive = ENV.MAINTENANCE_MODE;

export const auth = createAuth(ENV, db, [], maintenanceActive);

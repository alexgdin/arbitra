import { z } from "zod";

import { hasControlChars } from "./lib/text";

// Sumele sunt întregi în bani (129.99 RON = 12999), ca în schema DB. Coloanele sunt int4,
// deci o sumă mai mare ar da eroare de depășire (22003) în Postgres.
export const INT4_MAX = 2_147_483_647;
// Plafonul unui preț de produs: 100.000 RON. Prețurile vin de la orice cont, iar un plafon până la int4 ar
// lăsa un preț fals să arate economii de milioane.
export const MAX_BANI = 10_000_000;
export const bani = z.number().int().positive().max(MAX_BANI);
// Plafonul comenzii și bugetul lunar al brokerului nu sunt prețuri de produs și pot trece de plafonul de mai sus.
export const brokerBani = z.number().int().positive().max(INT4_MAX);

// Linkurile de imagine ajung în pagini ca href, deci acceptăm doar http(s).
export const httpUrl = z.url({ protocol: /^https?$/ });

// Text fără caractere de control: un NUL ar ajunge în Postgres și ar da eroare (22021).
export function withoutControlChars(value: string): boolean {
  return !hasControlChars(value);
}

export const CONTROL_CHARS_MESSAGE = "Control characters are not allowed";

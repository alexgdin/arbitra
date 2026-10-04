import { z } from "zod";

// Sumele sunt întregi în bani (129.99 RON = 12999), ca în schema DB.
export const bani = z.number().int().positive();

// Linkurile de produs ajung în pagini ca href, deci acceptăm doar http(s).
export const httpUrl = z.url({ protocol: /^https?$/ });

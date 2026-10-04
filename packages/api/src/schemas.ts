import { z } from "zod";

// Sumele sunt întregi în bani (129.99 RON = 12999), ca în schema DB.
export const bani = z.number().int().positive();

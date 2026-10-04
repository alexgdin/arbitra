/** Cât acceptă API-ul (catalog.search) pentru textul căutat. */
export const MAX_QUERY_LENGTH = 80;

/** Valoarea `q` din URL, curățată ca API-ul s-o accepte (prima valoare, fără spații la margini). */
export function readQueryParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim().slice(0, MAX_QUERY_LENGTH).trim();
}

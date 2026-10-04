import type { Route } from "next";

/** Pagina publică a unui produs, cu ofertele din toate magazinele. */
export function getProductHref(productId: string): Route {
  // segmentele dinamice calculate se tipează cu cast, ca în documentația typedRoutes
  return `/produs/${encodeURIComponent(productId)}` as Route;
}

/** Pagina de căutare; fără interogare duce la lista produselor actualizate recent. */
export function getSearchHref(query: string): Route {
  return query ? `/cauta?q=${encodeURIComponent(query)}` : "/cauta";
}

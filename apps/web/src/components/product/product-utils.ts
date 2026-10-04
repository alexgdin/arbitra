import type { AppRouter } from "@my-better-t-app/api/routers/index";
import { isTRPCClientError } from "@trpc/client";
import { z } from "zod";

import type { CatalogItem, CatalogOffer, PricedOffer } from "./types";

const MAX_RETRIES = 2;
const productIdSchema = z.uuid();

/** The API only accepts UUIDs, so any other address segment is a missing product. */
export function isValidProductId(value: string): boolean {
  return productIdSchema.safeParse(value).success;
}

export function isPriced(offer: CatalogOffer): offer is PricedOffer {
  return offer.price !== null;
}

/** The offer to preselect: the cheapest in-stock one when it is in the list, else the first. */
export function pickDefaultOffer<T extends CatalogOffer>(
  item: CatalogItem,
  offers: readonly T[],
): T | undefined {
  return offers.find((offer) => offer.productId === item.bestOffer?.productId) ?? offers[0];
}

/** An id that is not a UUID or a product that does not exist: retrying cannot help. */
export function isMissingProductError(error: unknown): boolean {
  if (!isTRPCClientError<AppRouter>(error)) {
    return false;
  }
  const code = error.data?.code;
  return code === "NOT_FOUND" || code === "BAD_REQUEST";
}

export function shouldRetryCompare(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_RETRIES && !isMissingProductError(error);
}

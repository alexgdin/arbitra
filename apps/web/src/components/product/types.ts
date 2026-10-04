import type { AppRouter } from "@my-better-t-app/api/routers/index";
import type { inferRouterOutputs } from "@trpc/server";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type CatalogItem = RouterOutputs["catalog"]["compare"];
export type CatalogOffer = CatalogItem["offers"][number];
export type PricedOffer = CatalogOffer & { price: number };

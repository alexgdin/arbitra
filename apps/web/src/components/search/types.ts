import type { AppRouter } from "@my-better-t-app/api/routers/index";
import type { inferRouterOutputs } from "@trpc/server";

type CatalogSearch = inferRouterOutputs<AppRouter>["catalog"]["search"];

export type CatalogItem = CatalogSearch["items"][number];
export type CatalogOffer = CatalogItem["offers"][number];

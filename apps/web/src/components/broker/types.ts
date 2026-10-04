import type { AppRouter } from "@my-better-t-app/api/routers/index";
import type { inferRouterOutputs } from "@trpc/server";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type BrokerSettingsData = RouterOutputs["broker"]["getSettings"];

export type ShippingAddressData = NonNullable<BrokerSettingsData["shippingAddress"]>;

/** A product row from `broker.listTargets` whose target price is known (amounts in bani). */
export type BrokerTarget = RouterOutputs["broker"]["listTargets"][number] & {
  targetPrice: number;
};

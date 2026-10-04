import type { AppRouter } from "@my-better-t-app/api/routers/index";
import type { inferRouterOutputs } from "@trpc/server";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type CartList = RouterOutputs["cart"]["list"];
export type CartItem = CartList["items"][number];
export type CartOptimization = RouterOutputs["cart"]["optimize"];
export type StorePlan = CartOptimization["plan"][number];
export type Product = RouterOutputs["product"]["list"][number];

export interface OptimizeItem {
  productId: string;
  quantity: number;
}

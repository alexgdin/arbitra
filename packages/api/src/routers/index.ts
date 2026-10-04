import { protectedProcedure, publicProcedure, router } from "../index";
import { brokerRouter } from "./broker";
import { cartRouter } from "./cart";
import { productRouter } from "./product";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
  product: productRouter,
  broker: brokerRouter,
  cart: cartRouter,
});
export type AppRouter = typeof appRouter;

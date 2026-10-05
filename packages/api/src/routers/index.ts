import { protectedProcedure, publicProcedure, router } from "../index";
import { alertsRouter } from "./alerts";
import { brokerRouter } from "./broker";
import { cartRouter } from "./cart";
import { catalogRouter } from "./catalog";
import { demoRouter } from "./demo";
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
  catalog: catalogRouter,
  broker: brokerRouter,
  cart: cartRouter,
  alerts: alertsRouter,
  demo: demoRouter,
});
export type AppRouter = typeof appRouter;

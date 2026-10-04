import type { Metadata } from "next";

import { CartOptimizer } from "@/components/cart/cart-optimizer";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Coș și optimizare",
};

export default function CartPage() {
  return (
    <>
      <PageHeader
        title="Coș și optimizare"
        description="Adaugă produsele pe care vrei să le cumperi, iar noi găsim cea mai ieftină împărțire între magazine, cu transportul inclus."
      />
      <CartOptimizer />
    </>
  );
}

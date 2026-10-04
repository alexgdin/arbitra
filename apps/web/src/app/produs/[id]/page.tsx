import type { Metadata } from "next";

import { ProductCompare } from "@/components/product/product-compare";

export const metadata: Metadata = {
  title: "Comparare prețuri",
};

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <ProductCompare productId={id} />
    </div>
  );
}

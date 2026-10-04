import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { readQueryParam } from "@/components/search/query";
import { SearchExperience } from "@/components/search/search-experience";

export const metadata: Metadata = {
  title: "Caută produse",
  description:
    "Caută un produs și compară prețurile din eMAG, PC Garage și Altex, fără cont. Vezi cât de proaspete sunt prețurile și cât economisești.",
};

export default async function SearchPage({ searchParams }: PageProps<"/cauta">) {
  const { q } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Caută produse"
        description="Compară prețurile aceluiași produs în eMAG, PC Garage și Altex. Nu ai nevoie de cont."
      />
      <SearchExperience initialQuery={readQueryParam(q)} />
    </div>
  );
}

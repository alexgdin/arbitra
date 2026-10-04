import { cn } from "@my-better-t-app/ui/lib/utils";
import Link from "next/link";

import { getSearchHref } from "./hrefs";

const POPULAR_SEARCHES = [
  "căști sony",
  "samsung galaxy",
  "laptop lenovo",
  "monitor lg",
  "ssd samsung",
  "mouse logitech",
] as const;

const LABEL_ID = "popular-searches-label";

/** Exemple de căutări, ca să ai de unde porni; fiecare e un link, deci merge și fără JavaScript. */
export function PopularSearches({
  centered = false,
  className,
}: {
  centered?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <p id={LABEL_ID} className="font-medium text-muted-foreground text-xs">
        Căutări populare
      </p>
      <ul
        aria-labelledby={LABEL_ID}
        className={cn("flex flex-wrap gap-2", centered && "justify-center")}
      >
        {POPULAR_SEARCHES.map((term) => (
          <li key={term}>
            <Link
              href={getSearchHref(term)}
              prefetch={false}
              className="inline-flex h-10 items-center rounded-full border bg-card px-4 font-medium text-sm shadow-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {term}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

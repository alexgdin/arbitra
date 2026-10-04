import { Button } from "@my-better-t-app/ui/components/button";
import { Input } from "@my-better-t-app/ui/components/input";
import { Label } from "@my-better-t-app/ui/components/label";
import { Search } from "lucide-react";

import { MAX_QUERY_LENGTH } from "./query";

const INPUT_ID = "hero-search";

/** Căutare din pagina de start: un formular HTML simplu spre /cauta, deci merge și fără JavaScript. */
export function HeroSearchForm() {
  return (
    <form role="search" action="/cauta" method="get" className="mt-8 max-w-lg space-y-2">
      <Label htmlFor={INPUT_ID}>Caută un produs, fără cont</Label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={INPUT_ID}
            name="q"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            maxLength={MAX_QUERY_LENGTH}
            placeholder="de exemplu căști Sony"
            className="h-11 pl-9 sm:h-11"
          />
        </div>
        <Button type="submit" size="lg" className="sm:h-11">
          Caută
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";

import { getSearchHref } from "./hrefs";

const SEARCH_DELAY_MS = 300;

/**
 * Starea căutării: textul din câmp, interogarea efectivă (cu întârziere la tastare) și
 * oglindirea ei în URL, fără intrări noi în istoric. `initialQuery` vine din URL, deci se
 * schimbă și la navigări externe (linkuri, înapoi): acelea rescriu câmpul, ecoul propriilor
 * scrieri în URL nu.
 */
export function useSearchQuery(initialQuery: string) {
  const router = useRouter();
  const [text, setText] = useState(initialQuery);
  const [instant, setInstant] = useState(false);
  const term = useDebouncedValue(text.trim(), instant ? 0 : SEARCH_DELAY_MS);
  // Ultima valoare scrisă în URL (sau primită din el) și scrierile noastre încă neconfirmate.
  const latest = useRef(initialQuery);
  const pending = useRef(new Set<string>());

  useEffect(() => {
    if (term === latest.current) {
      return;
    }
    latest.current = term;
    pending.current.add(term);
    router.replace(getSearchHref(term), { scroll: false });
  }, [term, router]);

  useEffect(() => {
    if (initialQuery === latest.current) {
      pending.current.clear();
      return;
    }
    if (pending.current.has(initialQuery)) {
      return;
    }
    latest.current = initialQuery;
    setText(initialQuery);
    setInstant(true);
  }, [initialQuery]);

  return {
    text,
    term,
    change(value: string) {
      setText(value);
      setInstant(false);
    },
    submit() {
      setInstant(true);
    },
    clear() {
      setText("");
      setInstant(true);
    },
  };
}

"use client";

import { Button } from "@my-better-t-app/ui/components/button";
import { Input } from "@my-better-t-app/ui/components/input";
import { Label } from "@my-better-t-app/ui/components/label";
import { Search, X } from "lucide-react";
import { useRef } from "react";

import { MAX_QUERY_LENGTH } from "./query";

const INPUT_ID = "search-q";

export function SearchBox({
  value,
  onChange,
  onSubmit,
  onClear,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleClear() {
    onClear();
    inputRef.current?.focus();
  }

  return (
    <form
      role="search"
      action="/cauta"
      method="get"
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="relative min-w-0 flex-1">
        <Label htmlFor={INPUT_ID} className="sr-only">
          Caută un produs
        </Label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={inputRef}
          id={INPUT_ID}
          name="q"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          maxLength={MAX_QUERY_LENGTH}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Caută un produs, de exemplu căști Sony"
          className="h-12 rounded-xl pr-12 pl-11 text-base shadow-sm sm:h-12 sm:text-base [&::-webkit-search-cancel-button]:appearance-none"
        />
        {value === "" ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Șterge căutarea"
            className="absolute top-1 right-1 sm:size-10"
            onClick={handleClear}
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
      <Button type="submit" size="lg" className="h-12 px-5 sm:h-12">
        Caută
      </Button>
    </form>
  );
}

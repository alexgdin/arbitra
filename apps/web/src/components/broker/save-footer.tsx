"use client";

import { Button } from "@my-better-t-app/ui/components/button";
import { CardFooter } from "@my-better-t-app/ui/components/card";
import { Check, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/** `saved` turns true for a few seconds after `flash()` so a form can confirm "Salvat". */
export function useSavedFlash(durationMs = 4000) {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flash = useCallback(() => {
    clearTimeout(timer.current);
    setSaved(true);
    timer.current = setTimeout(() => setSaved(false), durationMs);
  }, [durationMs]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return [saved, flash] as const;
}

/**
 * Card footer for a form: optional secondary actions on the left, a polite "Salvat" status and
 * the submit button on the right. The submit button is enabled only while the form is dirty.
 */
export function SaveFooter({
  dirty,
  saving,
  saved,
  label = "Salvează",
  extra,
}: {
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  label?: string;
  extra?: React.ReactNode;
}) {
  return (
    <CardFooter className="flex-wrap justify-end gap-x-3 gap-y-2">
      {extra ? <div className="mr-auto flex flex-wrap items-center gap-2">{extra}</div> : null}
      <div className="flex items-center">
        <p role="status">
          {saved && !dirty ? (
            <span className="flex items-center gap-1.5 pr-3 font-medium text-sm text-success">
              <Check aria-hidden="true" className="size-4" />
              Salvat
            </span>
          ) : null}
        </p>
        <Button type="submit" disabled={!dirty || saving}>
          {saving ? (
            <>
              <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
              Se salvează…
            </>
          ) : (
            label
          )}
        </Button>
      </div>
    </CardFooter>
  );
}

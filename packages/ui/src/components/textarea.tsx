import { cn } from "@my-better-t-app/ui/lib/utils";
import * as React from "react";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-sizing-content flex min-h-20 w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-base shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 sm:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:disabled:bg-input/60",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };

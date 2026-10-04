import { Label } from "@my-better-t-app/ui/components/label";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { CircleAlert } from "lucide-react";

export interface FieldControlProps {
  id: string;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
}

/** First human-readable message out of a TanStack Form `meta.errors` array. */
export function getFieldError(errors: readonly unknown[]): string | undefined {
  for (const error of errors) {
    if (typeof error === "string") {
      return error;
    }
    if (typeof error === "object" && error !== null && "message" in error) {
      const { message } = error;
      if (typeof message === "string") {
        return message;
      }
    }
  }
  return undefined;
}

/** Label, control, helper text and error message, wired together for screen readers. */
export function FormField({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: (control: FieldControlProps) => React.ReactNode;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy || undefined,
      })}
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
      <p
        id={errorId}
        aria-live="polite"
        className="flex items-start gap-1.5 text-destructive text-xs"
      >
        {error ? (
          <>
            <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            <span>{error}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}

import { Button } from "@my-better-t-app/ui/components/button";
import { Checkbox } from "@my-better-t-app/ui/components/checkbox";
import { Input } from "@my-better-t-app/ui/components/input";
import { Label } from "@my-better-t-app/ui/components/label";
import type { AnyFieldApi } from "@tanstack/react-form";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";

interface AuthFieldProps {
  field: AnyFieldApi;
  label: string;
  autoComplete: string;
  hint?: string;
  placeholder?: string;
}

function getErrorMessage(field: AnyFieldApi): string | undefined {
  if (!field.state.meta.isTouched) {
    return undefined;
  }
  const [first] = field.state.meta.errors;
  return typeof first === "string" ? first : first?.message;
}

/** Moves focus to the first field flagged invalid, once React has rendered the errors. */
export function focusFirstInvalidField(form: HTMLFormElement | null) {
  requestAnimationFrame(() => {
    form?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  });
}

function useFieldA11y(field: AnyFieldApi, hint?: string) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const error = getErrorMessage(field);
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return {
    id,
    hintId,
    errorId,
    error,
    inputProps: {
      id,
      name: field.name,
      value: field.state.value as string,
      onBlur: field.handleBlur,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        field.handleChange(event.target.value),
      "aria-invalid": error ? (true as const) : undefined,
      "aria-describedby": describedBy || undefined,
    },
  };
}

function FieldFrame({
  id,
  label,
  hint,
  hintId,
  error,
  errorId,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  hintId: string;
  error?: string;
  errorId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-destructive text-sm">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AuthField({
  field,
  label,
  autoComplete,
  hint,
  placeholder,
  type = "text",
}: AuthFieldProps & { type?: "text" | "email" }) {
  const { id, hintId, errorId, error, inputProps } = useFieldA11y(field, hint);

  return (
    <FieldFrame
      id={id}
      label={label}
      hint={hint}
      hintId={hintId}
      error={error}
      errorId={errorId}
    >
      <Input
        {...inputProps}
        type={type}
        autoComplete={autoComplete}
        autoCapitalize={type === "email" ? "none" : "words"}
        placeholder={placeholder}
        spellCheck={false}
      />
    </FieldFrame>
  );
}

export function PasswordField({ field, label, autoComplete, hint, placeholder }: AuthFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const { id, hintId, errorId, error, inputProps } = useFieldA11y(field, hint);

  return (
    <FieldFrame
      id={id}
      label={label}
      hint={hint}
      hintId={hintId}
      error={error}
      errorId={errorId}
    >
      <div className="relative">
        <Input
          {...inputProps}
          type={revealed ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          placeholder={placeholder}
          spellCheck={false}
          className="pr-11"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Afișează parola"
          aria-pressed={revealed}
          onClick={() => setRevealed((value) => !value)}
          className="absolute inset-y-0 right-0 text-muted-foreground hover:text-foreground"
        >
          {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
    </FieldFrame>
  );
}

/** Căsuță obligatorie (de exemplu acordul pentru termeni), cu eroarea legată prin aria-describedby. */
export function CheckboxField({
  field,
  label,
  children,
}: {
  field: AnyFieldApi;
  /** Numele accesibil al căsuței, fără textul ajutător al linkurilor din `children`. */
  label: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const error = getErrorMessage(field);

  return (
    <div className="grid gap-1.5">
      <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug">
        <Checkbox
          id={id}
          name={field.name}
          checked={field.state.value === true}
          onCheckedChange={(checked) => {
            field.handleChange(checked);
            field.handleBlur();
          }}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          aria-required="true"
          className="mt-0.5"
        />
        <span className="text-pretty">
          {children}
        </span>
      </label>
      {error ? (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-destructive text-sm">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

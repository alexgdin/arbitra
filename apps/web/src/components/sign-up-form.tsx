import { Button } from "@my-better-t-app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@my-better-t-app/ui/components/card";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import { getAuthErrorMessage, NETWORK_ERROR_MESSAGE } from "@/lib/auth-errors";

import { AuthField, CheckboxField, focusFirstInvalidField, PasswordField } from "./auth-fields";

const signUpSchema = z.object({
  name: z.string().trim().min(2, "Introdu numele tău (cel puțin 2 caractere)."),
  email: z.string().trim().pipe(z.email("Introdu o adresă de email validă.")),
  password: z.string().min(8, "Parola trebuie să aibă cel puțin 8 caractere."),
  acceptTerms: z
    .boolean()
    .refine((accepted) => accepted, "Trebuie să accepți termenii și condițiile ca să-ți creezi contul."),
});

const LEGAL_LINK_CLASS =
  "rounded-sm font-medium text-foreground underline underline-offset-4 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring";

export default function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      name: "",
      acceptTerms: false,
    },
    onSubmit: async ({ value }) => {
      try {
        await authClient.signUp.email(
          {
            email: value.email.trim(),
            password: value.password,
            name: value.name.trim(),
          },
          {
            onSuccess: () => {
              router.push("/dashboard");
              toast.success("Contul a fost creat. Bine ai venit!");
            },
            onError: (error) => {
              toast.error(getAuthErrorMessage(error.error));
            },
          },
        );
      } catch {
        toast.error(NETWORK_ERROR_MESSAGE);
      }
    },
    onSubmitInvalid: () => focusFirstInvalidField(formRef.current),
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: signUpSchema,
    },
  });

  return (
    <Card className="shadow-md">
      <CardHeader>
        <h1 tabIndex={-1} className="font-semibold text-2xl tracking-tight outline-none">
          Creează-ți contul
        </h1>
        <CardDescription>
          Contul este gratuit. Adaugi produse în coș și începi să urmărești prețurile.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          ref={formRef}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            form.handleSubmit();
          }}
          className="grid gap-4"
        >
          <form.Field name="name">
            {(field) => (
              <AuthField
                field={field}
                label="Nume"
                autoComplete="name"
                placeholder="Maria Popescu"
              />
            )}
          </form.Field>

          <form.Field name="email">
            {(field) => (
              <AuthField
                field={field}
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="nume@exemplu.ro"
              />
            )}
          </form.Field>

          <form.Field name="password">
            {(field) => (
              <PasswordField
                field={field}
                label="Parola"
                autoComplete="new-password"
                hint="Cel puțin 8 caractere."
              />
            )}
          </form.Field>

          <form.Field name="acceptTerms">
            {(field) => (
              <CheckboxField
                field={field}
                label="Sunt de acord cu Termenii și condițiile și cu Politica de confidențialitate"
              >
                Sunt de acord cu{" "}
                <Link
                  href="/termeni"
                  target="_blank"
                  rel="noopener"
                  className={LEGAL_LINK_CLASS}
                >
                  Termenii și condițiile
                  <span className="sr-only"> (se deschide într-o filă nouă)</span>
                </Link>{" "}
                și cu{" "}
                <Link
                  href="/confidentialitate"
                  target="_blank"
                  rel="noopener"
                  className={LEGAL_LINK_CLASS}
                >
                  Politica de confidențialitate
                  <span className="sr-only"> (se deschide într-o filă nouă)</span>
                </Link>
              </CheckboxField>
            )}
          </form.Field>

          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" size="lg" className="mt-1 w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
                    Se creează contul...
                  </>
                ) : (
                  "Creează contul"
                )}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
      <CardFooter className="flex-wrap justify-center gap-x-1 py-2 text-muted-foreground text-sm">
        Ai deja un cont?
        <Button type="button" variant="link" onClick={onSwitchToSignIn} className="px-1">
          Conectează-te
        </Button>
      </CardFooter>
    </Card>
  );
}

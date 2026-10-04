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
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import { getAuthErrorMessage, NETWORK_ERROR_MESSAGE } from "@/lib/auth-errors";

import { AuthField, focusFirstInvalidField, PasswordField } from "./auth-fields";

const signUpSchema = z.object({
  name: z.string().trim().min(2, "Introdu numele tău (cel puțin 2 caractere)."),
  email: z.string().trim().pipe(z.email("Introdu o adresă de email validă.")),
  password: z.string().min(8, "Parola trebuie să aibă cel puțin 8 caractere."),
});

export default function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      name: "",
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

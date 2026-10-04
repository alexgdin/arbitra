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

const signInSchema = z.object({
  email: z.string().trim().pipe(z.email("Introdu o adresă de email validă.")),
  password: z.string().min(1, "Introdu parola."),
});

export default function SignInForm({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      try {
        await authClient.signIn.email(
          {
            email: value.email.trim(),
            password: value.password,
          },
          {
            onSuccess: () => {
              router.push("/dashboard");
              toast.success("Te-ai conectat cu succes.");
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
      onDynamic: signInSchema,
    },
  });

  return (
    <Card className="shadow-md">
      <CardHeader>
        <h1 tabIndex={-1} className="font-semibold text-2xl tracking-tight outline-none">
          Bine ai revenit
        </h1>
        <CardDescription>
          Conectează-te ca să îți vezi coșul, prețurile țintă și comenzile automate.
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
              <PasswordField field={field} label="Parola" autoComplete="current-password" />
            )}
          </form.Field>

          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" size="lg" className="mt-1 w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
                    Se conectează...
                  </>
                ) : (
                  "Conectează-te"
                )}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
      <CardFooter className="flex-wrap justify-center gap-x-1 py-2 text-muted-foreground text-sm">
        Nu ai încă un cont?
        <Button type="button" variant="link" onClick={onSwitchToSignUp} className="px-1">
          Creează unul
        </Button>
      </CardFooter>
    </Card>
  );
}

"use client";

import { Badge } from "@my-better-t-app/ui/components/badge";
import { Button } from "@my-better-t-app/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card";
import { Input } from "@my-better-t-app/ui/components/input";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { FormField, getFieldError } from "./form-field";
import { SaveFooter, useSavedFlash } from "./save-footer";
import type { BrokerSettingsData } from "./types";
import { useUpdateSettings } from "./use-broker-mutations";

const paymentSchema = z.object({
  paymentMethodRef: z.string().trim().min(1, "Introdu tokenul primit de la furnizorul de plăți."),
});

export function PaymentMethodCard({ settings }: { settings: BrokerSettingsData }) {
  const saveMethod = useUpdateSettings();
  const removeMethod = useUpdateSettings();
  const [saved, flashSaved] = useSavedFlash();
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const { hasPaymentMethod } = settings;

  const form = useForm({
    defaultValues: { paymentMethodRef: "" },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    validators: { onDynamic: paymentSchema },
    onSubmit: ({ value, formApi }) => {
      saveMethod.mutate(
        { paymentMethodRef: value.paymentMethodRef.trim() },
        {
          onSuccess: () => {
            formApi.reset();
            flashSaved();
            toast.success("Metoda de plată a fost salvată.");
          },
        },
      );
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Metodă de plată</CardTitle>
        <CardDescription>
          Salvăm doar un token de la furnizorul de plăți, niciodată numărul cardului.
        </CardDescription>
        <CardAction>
          {hasPaymentMethod ? (
            <Badge variant="success">
              <CircleCheck aria-hidden="true" />
              Salvată
            </Badge>
          ) : (
            <Badge variant="secondary">Nesetată</Badge>
          )}
        </CardAction>
      </CardHeader>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          form.handleSubmit();
        }}
        className="flex flex-col gap-(--card-spacing)"
      >
        <CardContent>
          <form.Field name="paymentMethodRef">
            {(field) => (
              <FormField
                id="broker-payment-method-ref"
                label={hasPaymentMethod ? "Înlocuiește tokenul de plată" : "Token metodă de plată"}
                hint="Plățile reale nu sunt active încă. Tokenul nu mai este afișat după salvare."
                error={getFieldError(field.state.meta.errors)}
              >
                {(control) => (
                  <Input
                    {...control}
                    type="password"
                    name={field.name}
                    value={field.state.value}
                    placeholder="Lipește tokenul aici"
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-1p-ignore
                    data-lpignore="true"
                    data-bwignore
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                )}
              </FormField>
            )}
          </form.Field>
        </CardContent>

        <form.Subscribe selector={(state) => !state.isDefaultValue}>
          {(dirty) => (
            <SaveFooter
              dirty={dirty}
              saving={saveMethod.isPending}
              saved={saved}
              label="Salvează metoda de plată"
              extra={
                hasPaymentMethod ? (
                  <>
                    <Button
                      type="button"
                      variant={confirmingRemoval ? "destructive" : "ghost"}
                      className={
                        confirmingRemoval
                          ? undefined
                          : "text-destructive hover:bg-destructive/10 hover:text-destructive"
                      }
                      disabled={removeMethod.isPending}
                      onClick={() => {
                        if (!confirmingRemoval) {
                          setConfirmingRemoval(true);
                          return;
                        }
                        removeMethod.mutate(
                          { paymentMethodRef: null },
                          {
                            onSuccess: () => {
                              setConfirmingRemoval(false);
                              toast.success("Metoda de plată a fost eliminată.");
                            },
                          },
                        );
                      }}
                    >
                      {confirmingRemoval ? "Confirmă eliminarea" : "Elimină"}
                    </Button>
                    {confirmingRemoval ? (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={removeMethod.isPending}
                        onClick={() => setConfirmingRemoval(false)}
                      >
                        Anulează
                      </Button>
                    ) : null}
                  </>
                ) : null
              }
            />
          )}
        </form.Subscribe>
      </form>
    </Card>
  );
}

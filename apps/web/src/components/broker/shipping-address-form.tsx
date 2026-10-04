"use client";

import { Button } from "@my-better-t-app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card";
import { Input } from "@my-better-t-app/ui/components/input";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import z from "zod";

import { FormField, getFieldError } from "./form-field";
import { SaveFooter, useSavedFlash } from "./save-footer";
import type { BrokerSettingsData, ShippingAddressData } from "./types";
import { useUpdateSettings } from "./use-broker-mutations";

const required = (message: string) => z.string().trim().min(1, message);

const addressSchema = z.object({
  name: required("Introdu numele destinatarului."),
  phone: z.string().trim().min(6, "Introdu un număr de telefon valid (minimum 6 caractere)."),
  street: required("Introdu strada și numărul."),
  city: required("Introdu localitatea."),
  county: required("Introdu județul."),
  postalCode: required("Introdu codul poștal."),
  country: z.string().trim().min(2, "Introdu țara."),
});

const EMPTY_ADDRESS: ShippingAddressData = {
  name: "",
  phone: "",
  street: "",
  city: "",
  county: "",
  postalCode: "",
  country: "România",
};

const FIELDS = [
  { name: "name", label: "Nume complet", autoComplete: "name", wide: false },
  { name: "phone", label: "Telefon", autoComplete: "tel", inputMode: "tel", wide: false },
  {
    name: "street",
    label: "Stradă, număr, bloc, apartament",
    autoComplete: "street-address",
    wide: true,
  },
  { name: "city", label: "Localitate", autoComplete: "address-level2", wide: false },
  { name: "county", label: "Județ", autoComplete: "address-level1", wide: false },
  {
    name: "postalCode",
    label: "Cod poștal",
    autoComplete: "postal-code",
    inputMode: "numeric",
    wide: false,
  },
  { name: "country", label: "Țară", autoComplete: "country-name", wide: false },
] as const;

export function ShippingAddressForm({ settings }: { settings: BrokerSettingsData }) {
  const saveAddress = useUpdateSettings();
  const deleteAddress = useUpdateSettings();
  const [saved, flashSaved] = useSavedFlash();
  const hasAddress = settings.shippingAddress !== null;

  const form = useForm({
    defaultValues: settings.shippingAddress ?? EMPTY_ADDRESS,
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    validators: { onDynamic: addressSchema },
    onSubmit: ({ value, formApi }) => {
      const shippingAddress = addressSchema.parse(value);
      saveAddress.mutate(
        { shippingAddress },
        {
          onSuccess: () => {
            formApi.reset(shippingAddress);
            flashSaved();
            toast.success("Adresa de livrare a fost salvată.");
          },
        },
      );
    },
  });

  return (
    <Card className="@container">
      <CardHeader>
        <CardTitle>Adresa de livrare</CardTitle>
        <CardDescription>
          Aici trimitem comenzile plasate automat. Toate câmpurile sunt obligatorii.
        </CardDescription>
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
        <CardContent className="grid @sm:grid-cols-2 gap-x-4 gap-y-3">
          {FIELDS.map((config) => (
            <form.Field key={config.name} name={config.name}>
              {(field) => (
                <FormField
                  id={`broker-shipping-${config.name}`}
                  label={config.label}
                  error={getFieldError(field.state.meta.errors)}
                  className={config.wide ? "@sm:col-span-2" : undefined}
                >
                  {(control) => (
                    <Input
                      {...control}
                      name={field.name}
                      value={field.state.value}
                      autoComplete={config.autoComplete}
                      inputMode={"inputMode" in config ? config.inputMode : undefined}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                  )}
                </FormField>
              )}
            </form.Field>
          ))}
        </CardContent>

        <form.Subscribe selector={(state) => !state.isDefaultValue}>
          {(dirty) => (
            <SaveFooter
              dirty={dirty}
              saving={saveAddress.isPending}
              saved={saved}
              label="Salvează adresa"
              extra={
                hasAddress ? (
                  <Button
                    type="button"
                    variant="link"
                    className="text-destructive"
                    disabled={deleteAddress.isPending}
                    onClick={() =>
                      deleteAddress.mutate(
                        { shippingAddress: null },
                        {
                          onSuccess: () => {
                            form.reset(EMPTY_ADDRESS);
                            toast.success("Adresa de livrare a fost ștearsă.");
                          },
                        },
                      )
                    }
                  >
                    Șterge adresa
                  </Button>
                ) : null
              }
            />
          )}
        </form.Subscribe>
      </form>
    </Card>
  );
}

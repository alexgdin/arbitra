"use client";

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

import { baniToLeiInput, parseLeiToBani } from "@/lib/format";

import { FormField, getFieldError } from "./form-field";
import { SaveFooter, useSavedFlash } from "./save-footer";
import type { BrokerSettingsData } from "./types";
import { useUpdateSettings } from "./use-broker-mutations";

const optionalAmount = z
  .string()
  .refine(
    (value) => value.trim() === "" || parseLeiToBani(value) !== null,
    "Introdu o sumă validă, mai mare ca 0 (de exemplu 1500 sau 1500,50).",
  );

const limitsSchema = z
  .object({ maxOrderValue: optionalAmount, monthlyBudget: optionalAmount })
  .refine(
    ({ maxOrderValue, monthlyBudget }) => {
      const perOrder = parseLeiToBani(maxOrderValue);
      const monthly = parseLeiToBani(monthlyBudget);
      return perOrder === null || monthly === null || monthly >= perOrder;
    },
    {
      path: ["monthlyBudget"],
      message: "Bugetul lunar nu poate fi mai mic decât valoarea maximă per comandă.",
    },
  );

function toInputValue(bani: number | null): string {
  return bani === null ? "" : baniToLeiInput(bani);
}

export function LimitsForm({ settings }: { settings: BrokerSettingsData }) {
  const updateSettings = useUpdateSettings();
  const [saved, flashSaved] = useSavedFlash();

  const form = useForm({
    defaultValues: {
      maxOrderValue: toInputValue(settings.maxOrderValue),
      monthlyBudget: toInputValue(settings.monthlyBudget),
    },
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    validators: { onDynamic: limitsSchema },
    onSubmit: ({ value, formApi }) => {
      const maxOrderValue = parseLeiToBani(value.maxOrderValue);
      const monthlyBudget = parseLeiToBani(value.monthlyBudget);
      updateSettings.mutate(
        { maxOrderValue, monthlyBudget },
        {
          onSuccess: () => {
            formApi.reset({
              maxOrderValue: toInputValue(maxOrderValue),
              monthlyBudget: toInputValue(monthlyBudget),
            });
            flashSaved();
            toast.success("Limitele au fost salvate.");
          },
        },
      );
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Limite de cheltuieli</CardTitle>
        <CardDescription>
          Brokerul cumpără doar în limitele de mai jos. Setează cel puțin una, ca să poată
          funcționa.
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
        <CardContent className="space-y-4">
          <form.Field name="maxOrderValue">
            {(field) => (
              <FormField
                id="broker-max-order-value"
                label="Valoare maximă per comandă"
                hint="Brokerul nu plasează comenzi mai mari decât această sumă. Lasă gol pentru fără limită."
                error={getFieldError(field.state.meta.errors)}
              >
                {(control) => (
                  <LeiInput
                    {...control}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                )}
              </FormField>
            )}
          </form.Field>

          <form.Field name="monthlyBudget">
            {(field) => (
              <FormField
                id="broker-monthly-budget"
                label="Buget lunar"
                hint="Suma totală pe care brokerul o poate cheltui într-o lună. Lasă gol pentru fără limită."
                error={getFieldError(field.state.meta.errors)}
              >
                {(control) => (
                  <LeiInput
                    {...control}
                    name={field.name}
                    value={field.state.value}
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
              saving={updateSettings.isPending}
              saved={saved}
              label="Salvează limitele"
            />
          )}
        </form.Subscribe>
      </form>
    </Card>
  );
}

function LeiInput(props: React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="Fără limită"
        className="pr-12 tabular-nums"
        {...props}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground text-sm">
        lei
      </span>
    </div>
  );
}

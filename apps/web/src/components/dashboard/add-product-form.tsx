"use client";

import { isValidGtin, normalizeModelCode } from "@my-better-t-app/api/lib/identifiers";
import { isStoreHostname } from "@my-better-t-app/api/lib/store-config";
import { Button } from "@my-better-t-app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@my-better-t-app/ui/components/card";
import { Input } from "@my-better-t-app/ui/components/input";
import { Label } from "@my-better-t-app/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@my-better-t-app/ui/components/native-select";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import type { AnyFieldApi } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import z from "zod";

import { parseLeiToBani } from "@/lib/format";
import { getStore, STORE_IDS } from "@/lib/stores";
import { queryClient, trpc } from "@/utils/trpc";

const ADD_PRODUCT_FORM_ID = "adauga-produs";
const FIELD_ID_PREFIX = "add-product-";
const DEFAULT_STORE: string = STORE_IDS[0];
const HTTP_PROTOCOL = /^https?$/;
const LEADING_WWW = /^www\./;
const TRAILING_SLASHES = /\/+$/;
const MAX_EXTERNAL_ID_LENGTH = 128;

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url.trim()).hostname;
  } catch {
    return undefined;
  }
}

/** The store whose domain (or a subdomain of it) the link is on, if any. */
function detectStore(url: string): (typeof STORE_IDS)[number] | undefined {
  const hostname = hostnameOf(url);
  return hostname === undefined
    ? undefined
    : STORE_IDS.find((id) => isStoreHostname(id, hostname));
}

// Identificatorii invalizi ar fi ignorați de server după un mesaj de succes, deci se verifică aici.
const formSchema = z
  .object({
    url: z
      .string()
      .trim()
      .pipe(
        z.url({
          protocol: HTTP_PROTOCOL,
          hostname: z.regexes.domain,
          error: "Introdu un link valid, care începe cu https://",
        }),
      ),
    store: z.string().refine((value) => STORE_IDS.some((id) => id === value), "Alege un magazin."),
    title: z.string().trim().min(3, "Scrie numele produsului (minimum 3 caractere)."),
    price: z
      .string()
      .refine(
        (value) => parseLeiToBani(value) !== null,
        "Introdu un preț valid, de exemplu 129,99.",
      ),
    ean: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || isValidGtin(value),
        "Cod EAN invalid: verifică cifra de control",
      ),
    mpn: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || normalizeModelCode(value) !== null,
        "Cod model invalid: scrie codul producătorului, de exemplu WDS200T4G0E.",
      ),
  })
  // Serverul acceptă doar linkuri de pe domeniul magazinului ales. Un link sau un magazin invalid
  // are deja propria eroare, deci aici nu se mai adaugă una.
  .refine(
    ({ url, store }) => {
      const hostname = hostnameOf(url);
      const known = STORE_IDS.find((id) => id === store);
      return hostname === undefined || known === undefined || isStoreHostname(known, hostname);
    },
    {
      path: ["url"],
      message: "Linkul nu este de pe magazinul ales. Alege magazinul potrivit sau lipește alt link.",
    },
  );

/** Scrolls to the form and puts the cursor in its first field. */
export function focusAddProductForm() {
  document.getElementById(ADD_PRODUCT_FORM_ID)?.scrollIntoView({ block: "start" });
  document.getElementById(`${FIELD_ID_PREFIX}url`)?.focus({ preventScroll: true });
}

/**
 * The same page always maps to the same product, so adding it twice never duplicates it.
 * The server accepts at most 128 characters; for a longer address the end is kept, because the
 * product code that tells two pages apart comes after the long name.
 */
function getExternalId(url: string): string {
  const { hostname, pathname } = new URL(url);
  const id = `${hostname.replace(LEADING_WWW, "")}${pathname.replace(TRAILING_SLASHES, "")}`;
  return id.length > MAX_EXTERNAL_ID_LENGTH ? id.slice(-MAX_EXTERNAL_ID_LENGTH) : id;
}

function getFieldError(field: AnyFieldApi): string | undefined {
  if (!field.state.meta.isTouched) {
    return undefined;
  }
  const [first] = field.state.meta.errors;
  if (!first) {
    return undefined;
  }
  return typeof first === "string" ? first : first.message;
}

interface ControlProps {
  id: string;
  name: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
}

function FormField({
  field,
  label,
  hint,
  optional = false,
  className,
  children,
}: {
  field: AnyFieldApi;
  label: string;
  hint?: string;
  optional?: boolean;
  className?: string;
  children: (control: ControlProps) => React.ReactNode;
}) {
  const error = getFieldError(field);
  const id = `${FIELD_ID_PREFIX}${field.name}`;
  let describedBy: string | undefined;
  let message: React.ReactNode = null;
  if (error) {
    describedBy = `${id}-error`;
    message = (
      <p id={describedBy} role="alert" className="text-destructive text-sm">
        {error}
      </p>
    );
  } else if (hint) {
    describedBy = `${id}-hint`;
    message = (
      <p id={describedBy} className="text-muted-foreground text-xs">
        {hint}
      </p>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="font-normal text-muted-foreground">(opțional)</span> : null}
      </Label>
      {children({
        id,
        name: field.name,
        "aria-invalid": error !== undefined,
        "aria-describedby": describedBy,
      })}
      {message}
    </div>
  );
}

export function AddProductForm({
  onAdded,
  className,
}: {
  onAdded: (productId: string) => void;
  className?: string;
}) {
  const ingestPrice = useMutation(trpc.product.ingestPrice.mutationOptions());
  const addToCart = useMutation(trpc.cart.add.mutationOptions());

  const form = useForm({
    defaultValues: { url: "", store: DEFAULT_STORE, title: "", price: "", ean: "", mpn: "" },
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    validators: { onDynamic: formSchema },
    onSubmitInvalid: () => {
      requestAnimationFrame(() => {
        document
          .getElementById(ADD_PRODUCT_FORM_ID)
          ?.querySelector<HTMLElement>("[aria-invalid='true']")
          ?.focus();
      });
    },
    onSubmit: async ({ value, formApi }) => {
      const price = parseLeiToBani(value.price);
      const store = STORE_IDS.find((id) => id === value.store);
      const url = value.url.trim();
      if (price === null || store === undefined) {
        return;
      }
      try {
        const { productId } = await ingestPrice.mutateAsync({
          store,
          externalId: getExternalId(url),
          title: value.title.trim(),
          url,
          price,
          ean: value.ean.trim() || undefined,
          mpn: value.mpn.trim() || undefined,
        });
        await addToCart.mutateAsync({ productId });
        toast.success("Produsul a fost adăugat în lista ta.");
        formApi.reset();
        await queryClient.invalidateQueries(trpc.cart.list.queryFilter());
        onAdded(productId);
      } catch {
        toast.error("Nu am putut adăuga produsul. Verifică datele și încearcă din nou.");
      }
    },
  });

  return (
    <Card id={ADD_PRODUCT_FORM_ID} className={className}>
      <CardHeader>
        <h2 className="font-semibold text-lg leading-snug">Adaugă un produs</h2>
        <CardDescription>
          Până când extensia de browser este gata, poți adăuga produse manual: copiază linkul și
          prețul din magazin.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            form.handleSubmit();
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <form.Field name="url">
            {(field) => (
              <FormField
                field={field}
                label="Linkul produsului"
                hint="Lipește adresa paginii produsului din magazin."
                className="sm:col-span-2"
              >
                {(control) => (
                  <Input
                    {...control}
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    placeholder="https://www.emag.ro/…"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      field.handleChange(event.target.value);
                      const detected = detectStore(event.target.value);
                      if (detected) {
                        form.setFieldValue("store", detected);
                      }
                    }}
                  />
                )}
              </FormField>
            )}
          </form.Field>

          <form.Field name="title">
            {(field) => (
              <FormField field={field} label="Numele produsului" className="sm:col-span-2">
                {(control) => (
                  <Input
                    {...control}
                    autoComplete="off"
                    maxLength={200}
                    placeholder="ex. Telefon Samsung Galaxy S24, 256 GB"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                )}
              </FormField>
            )}
          </form.Field>

          <form.Field name="store">
            {(field) => (
              <FormField field={field} label="Magazin">
                {(control) => (
                  <NativeSelect
                    {...control}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  >
                    {STORE_IDS.map((id) => (
                      <NativeSelectOption key={id} value={id}>
                        {getStore(id).name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
            )}
          </form.Field>

          <form.Field name="price">
            {(field) => (
              <FormField field={field} label="Prețul de acum (lei)">
                {(control) => (
                  <div className="relative">
                    <Input
                      {...control}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="ex. 129,99"
                      className="pr-11 tabular-nums"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground text-sm"
                    >
                      lei
                    </span>
                  </div>
                )}
              </FormField>
            )}
          </form.Field>

          <form.Field name="ean">
            {(field) => (
              <FormField
                field={field}
                label="Cod EAN"
                optional
                hint="Codul de bare (8, 12, 13 sau 14 cifre) leagă produsul de același produs din alte magazine."
              >
                {(control) => (
                  <Input
                    {...control}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={14}
                    placeholder="ex. 8806095023456"
                    className="tabular-nums"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                )}
              </FormField>
            )}
          </form.Field>

          <form.Field name="mpn">
            {(field) => (
              <FormField
                field={field}
                label="Cod model"
                optional
                hint="Codul producătorului (de pe pagina produsului) leagă produsul de celelalte magazine, chiar dacă nu are EAN."
              >
                {(control) => (
                  <Input
                    {...control}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={128}
                    placeholder="ex. WDS200T4G0E"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                )}
              </FormField>
            )}
          </form.Field>

          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <div className="flex sm:col-span-2 sm:justify-end">
                <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                  {isSubmitting ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="motion-safe:animate-spin"
                      data-icon="inline-start"
                    />
                  ) : (
                    <Plus aria-hidden="true" data-icon="inline-start" />
                  )}
                  {isSubmitting ? "Se adaugă…" : "Adaugă în listă"}
                </Button>
              </div>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  );
}

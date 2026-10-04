"use client";

import { useQuery } from "@tanstack/react-query";

import { trpc } from "@/utils/trpc";

import { BrokerToggleCard } from "./broker-toggle-card";
import { QueryError, SettingsSkeleton } from "./broker-states";
import { HowItWorks } from "./how-it-works";
import { LimitsForm } from "./limits-form";
import { PaymentMethodCard } from "./payment-method-card";
import { ShippingAddressForm } from "./shipping-address-form";
import { TargetsTable } from "./targets-table";

export function BrokerSettings() {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <SettingsColumn />
      <div className="flex min-w-0 flex-col gap-6">
        <TargetsTable />
        <HowItWorks />
      </div>
    </div>
  );
}

function SettingsColumn() {
  const query = useQuery(trpc.broker.getSettings.queryOptions());

  if (!query.data) {
    return query.isError ? (
      <QueryError
        title="Nu am putut încărca setările brokerului"
        onRetry={() => query.refetch()}
        retrying={query.isFetching}
      />
    ) : (
      <SettingsSkeleton />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <BrokerToggleCard settings={query.data} />
      <LimitsForm settings={query.data} />
      <PaymentMethodCard settings={query.data} />
      <ShippingAddressForm settings={query.data} />
    </div>
  );
}

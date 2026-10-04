import type { Metadata } from "next";

import { BrokerSettings } from "@/components/broker/broker-settings";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Broker automat",
};

export default function BrokerPage() {
  return (
    <>
      <PageHeader
        title="Broker automat"
        description="Setezi prețul dorit pentru un produs, iar brokerul îl cumpără în locul tău când ajunge la el, în limitele alese de tine."
      />
      <BrokerSettings />
    </>
  );
}

import type { Metadata } from "next";

import { PriceAlerts } from "@/components/broker/price-alerts";
import { ENTER } from "@/components/dashboard/enter-animation";
import { DemoDropCard } from "@/components/notifications/demo-drop-card";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Alerte de preț",
};

export default function PriceAlertsPage() {
  return (
    <>
      <PageHeader
        className={ENTER}
        title="Alerte de preț"
        description="Setezi prețul țintă pentru un produs, iar noi te anunțăm în aplicație când prețul ajunge la el sau scade sub el."
      />
      <PriceAlerts />
      <DemoDropCard className="mt-6" />
    </>
  );
}

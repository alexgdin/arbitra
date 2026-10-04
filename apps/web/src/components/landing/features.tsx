import { Badge } from "@my-better-t-app/ui/components/badge";
import { Card, CardContent } from "@my-better-t-app/ui/components/card";
import {
  BellRing,
  Bot,
  ChartLine,
  type LucideIcon,
  ShieldCheck,
  ShoppingCart,
  TicketPercent,
} from "lucide-react";

import { SectionHeading } from "./section-heading";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  comingSoon?: boolean;
}

const FEATURES: readonly Feature[] = [
  {
    icon: ChartLine,
    title: "Istoric de prețuri",
    description:
      "Vezi cum s-a schimbat prețul fiecărui produs și află dacă oferta de acum chiar merită.",
  },
  {
    icon: BellRing,
    title: "Alerte și preț țintă",
    description:
      "Alegi prețul la care vrei produsul, iar noi îl urmărim. Vezi imediat când ținta este atinsă.",
  },
  {
    icon: Bot,
    title: "Broker automat",
    description:
      "Cumpără când ajunge la prețul tău. Stabilești limita comenzii și bugetul lunar, iar noi plasăm comanda.",
  },
  {
    icon: ShoppingCart,
    title: "Optimizare de coș",
    description:
      "Împărțim comanda între magazine ca să plătești cel mai puțin și să economisești la transport.",
  },
  {
    icon: ShieldCheck,
    title: "Protecția prețului",
    description:
      "Dacă prețul scade în 14 zile după cumpărare, poți depune o cerere de rambursare a diferenței.",
  },
  {
    icon: TicketPercent,
    title: "Cupoane automate",
    description:
      "Extensia de browser aplică singură cupoanele valabile când finalizezi comanda. Este în lucru.",
    comingSoon: true,
  },
];

export function Features() {
  return (
    <section
      id="functii"
      aria-labelledby="features-title"
      className="px-4 py-16 sm:px-6 sm:py-24"
    >
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          id="features-title"
          eyebrow="Funcții"
          title="Tot ce îți trebuie ca să nu mai plătești în plus"
          description="De la urmărirea prețurilor până la cumpărarea automată, fiecare pas te ajută să economisești."
        />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description, comingSoon }) => (
            <li key={title}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    {comingSoon ? <Badge variant="warning">În curând</Badge> : null}
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="font-semibold text-base tracking-tight">{title}</h3>
                    <p className="text-pretty text-muted-foreground text-sm/relaxed">
                      {description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

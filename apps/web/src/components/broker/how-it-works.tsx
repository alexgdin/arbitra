import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card";
import { BellRing, ChartLine, Info, Target } from "lucide-react";

import { BRAND } from "@/lib/brand";

const STEPS = [
  {
    icon: Target,
    title: "Setezi ținta",
    description: "Alegi un produs și prețul la care ți se pare că merită cumpărat.",
  },
  {
    icon: ChartLine,
    title: "Urmărim prețul",
    description: "Verificăm prețul în eMAG, PC Garage și Altex și îți păstrăm istoricul.",
  },
  {
    icon: BellRing,
    title: "Te anunțăm",
    description:
      "Când prețul ajunge la țintă sau scade sub ea, produsul apare marcat „Țintă atinsă”.",
  },
] as const;

export function HowItWorks({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Cum funcționează</CardTitle>
        <CardDescription>Trei pași simpli, iar urmărirea o facem noi.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ol className="space-y-4">
          {STEPS.map(({ icon: Icon, title, description }) => (
            <li key={title} className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4.5"
              >
                <Icon />
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium text-sm">{title}</p>
                <p className="text-muted-foreground text-sm">{description}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex gap-3 rounded-lg bg-muted p-4 text-sm">
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Tu decizi când cumperi.</span> {BRAND.name}{" "}
            nu plasează comenzi în locul tău: îți arată doar momentul în care prețul a ajuns unde
            voiai.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

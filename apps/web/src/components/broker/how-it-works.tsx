import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card";
import { ChartLine, ShieldCheck, ShoppingCart, Target } from "lucide-react";

const STEPS = [
  {
    icon: Target,
    title: "Setezi ținta",
    description: "Alegi un produs și prețul la care vrei să îl cumperi.",
  },
  {
    icon: ChartLine,
    title: "Urmărim prețul",
    description: "Verificăm prețul în eMAG, PC Garage și Altex și îți păstrăm istoricul.",
  },
  {
    icon: ShoppingCart,
    title: "Cumpărăm când e atinsă",
    description: "Când prețul ajunge la țintă, plasăm comanda în limitele pe care le-ai setat.",
  },
] as const;

export function HowItWorks() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cum funcționează</CardTitle>
        <CardDescription>Trei pași, iar restul îl facem noi.</CardDescription>
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
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Tu ești în control.</span> Cumpărarea
            automată pornește doar când brokerul este activ și complet configurat: metodă de plată,
            adresă de livrare și cel puțin o limită. Nu cumpărăm niciodată peste limitele setate de
            tine, iar brokerul se poate opri oricând.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

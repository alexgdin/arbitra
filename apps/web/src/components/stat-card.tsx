import { Card, CardContent } from "@my-better-t-app/ui/components/card";
import { cn } from "@my-better-t-app/ui/lib/utils";

const TONES = {
  default: "bg-secondary text-secondary-foreground",
  success: "bg-success/10 text-success dark:bg-success/15",
  warning: "bg-warning/20 text-warning-foreground dark:bg-warning/25",
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  return (
    <Card size="sm" className={className}>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground text-sm">{label}</p>
          <p className="font-semibold text-2xl tabular-nums tracking-tight">{value}</p>
          {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
        </div>
        {icon ? (
          <div
            aria-hidden="true"
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-5",
              TONES[tone],
            )}
          >
            {icon}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

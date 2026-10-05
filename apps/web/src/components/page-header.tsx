import { cn } from "@my-better-t-app/ui/lib/utils";

import { ScrambleText } from "@/components/motion/scramble-text";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
          {/* text titles decode once on mount; the server render shows the final text */}
          {typeof title === "string" ? <ScrambleText text={title} stagger={34} /> : title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-pretty text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      ) : null}
    </div>
  );
}

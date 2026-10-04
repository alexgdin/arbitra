import { cn } from "@my-better-t-app/ui/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("rounded-lg bg-foreground/8 motion-safe:animate-pulse", className)}
      {...props}
    />
  );
}

export { Skeleton };

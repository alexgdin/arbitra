import { cn } from "@my-better-t-app/ui/lib/utils";

export default function Loader({ className }: { className?: string }) {
  return (
    <div role="status" className={cn("flex w-full items-center justify-center py-16", className)}>
      <span
        aria-hidden="true"
        className="size-8 rounded-full border-[3px] border-primary/20 border-t-primary motion-safe:animate-spin"
      />
      <span className="sr-only">Se încarcă...</span>
    </div>
  );
}

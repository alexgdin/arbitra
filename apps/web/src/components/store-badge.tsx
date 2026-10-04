import { Badge } from "@my-better-t-app/ui/components/badge";

import { getStore } from "@/lib/stores";

export function StoreBadge({ store }: { store: string }) {
  const { name, colorVar } = getStore(store);

  return (
    <Badge variant="outline" className="gap-1.5">
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: colorVar }}
      />
      {name}
    </Badge>
  );
}

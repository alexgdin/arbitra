import { Badge } from "@my-better-t-app/ui/components/badge";
import { Clock, TriangleAlert } from "lucide-react";

import { formatRelativeTime } from "@/lib/format";

const HOUR_MS = 3_600_000;
const FRESH_HOURS = 6;
const STALE_HOURS = 24;

type PriceFreshness = "fresh" | "recent" | "stale" | "unknown";

/** Cât de proaspăt e un preț, după momentul ultimei verificări. */
function getPriceFreshness(checkedAt: string | Date | null | undefined): PriceFreshness {
  if (!checkedAt) {
    return "unknown";
  }
  const time = new Date(checkedAt).getTime();
  if (Number.isNaN(time)) {
    return "unknown";
  }
  const ageHours = (Date.now() - time) / HOUR_MS;
  if (ageHours <= FRESH_HOURS) {
    return "fresh";
  }
  return ageHours <= STALE_HOURS ? "recent" : "stale";
}

/** Eticheta „Actualizat acum 3 ore”; după 24 de ore avertizează că prețul poate fi depășit. */
export function FreshnessBadge({
  checkedAt,
  className,
}: {
  checkedAt: string | Date | null | undefined;
  className?: string;
}) {
  const freshness = getPriceFreshness(checkedAt);

  if (freshness === "unknown" || !checkedAt) {
    return (
      <Badge variant="secondary" className={className}>
        <Clock aria-hidden="true" />
        Nu a fost verificat
      </Badge>
    );
  }

  const age = formatRelativeTime(checkedAt);

  if (freshness === "stale") {
    return (
      <Badge variant="warning" className={className}>
        <TriangleAlert aria-hidden="true" />
        Preț posibil depășit · {age}
      </Badge>
    );
  }

  return (
    <Badge variant={freshness === "fresh" ? "success" : "outline"} className={className}>
      <Clock aria-hidden="true" />
      Actualizat {age}
    </Badge>
  );
}

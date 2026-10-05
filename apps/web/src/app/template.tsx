import { RouteTransition } from "@/components/motion/route-transition";

/** Remounts on every top-level navigation, so each page enters with a short transition. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <RouteTransition>{children}</RouteTransition>;
}

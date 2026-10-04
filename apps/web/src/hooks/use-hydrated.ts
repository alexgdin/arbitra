import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * False on the server and during hydration, true afterwards. Gate UI that depends on
 * client-only state (such as the auth session) with it so the first client render matches
 * the server HTML even when that state has already changed.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

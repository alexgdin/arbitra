import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { queryClient, trpc } from "@/utils/trpc";

interface ErrorLike {
  data?: { code?: string } | null;
}

function showError(error: ErrorLike): void {
  toast.error(
    error.data?.code === "UNAUTHORIZED"
      ? "Sesiunea a expirat. Autentifică-te din nou."
      : "Nu am putut salva modificarea. Verifică datele și încearcă din nou.",
  );
}

/** Refreshes everything the Auto-Broker page (and the cart's target info) reads from. */
function invalidateBrokerQueries(): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries(trpc.broker.getSettings.queryFilter()),
    queryClient.invalidateQueries(trpc.broker.listTargets.queryFilter()),
    queryClient.invalidateQueries(trpc.cart.list.queryFilter()),
  ]);
}

export function useUpdateSettings() {
  return useMutation(
    trpc.broker.updateSettings.mutationOptions({
      onSuccess: invalidateBrokerQueries,
      onError: showError,
    }),
  );
}

export function useSetTarget() {
  return useMutation(
    trpc.broker.setTarget.mutationOptions({
      onSuccess: invalidateBrokerQueries,
      onError: showError,
    }),
  );
}

/** The success toast lives here: the row (and its button) unmounts once the list refreshes. */
export function useClearTarget() {
  return useMutation(
    trpc.broker.clearTarget.mutationOptions({
      onSuccess: () => {
        toast.success("Ținta a fost eliminată.");
        return invalidateBrokerQueries();
      },
      onError: showError,
    }),
  );
}

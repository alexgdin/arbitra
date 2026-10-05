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
      : "Nu am putut salva modificarea. Încearcă din nou.",
  );
}

/** Refreshes everything the price alerts page (and the cart's target info) reads from. */
function invalidateTargetQueries(): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries(trpc.broker.listTargets.queryFilter()),
    queryClient.invalidateQueries(trpc.cart.list.queryFilter()),
  ]);
}

/** The success toast lives here: the row (and its button) unmounts once the list refreshes. */
export function useClearTarget() {
  return useMutation(
    trpc.broker.clearTarget.mutationOptions({
      onSuccess: () => {
        toast.success("Ținta a fost eliminată.");
        return invalidateTargetQueries();
      },
      onError: showError,
    }),
  );
}

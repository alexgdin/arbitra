import type { AppRouter } from "@my-better-t-app/api/routers/index";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, isTRPCClientError } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "Sesiunea a expirat. Autentifică-te din nou.",
  NOT_FOUND: "Nu am găsit ce căutai. Încearcă din nou.",
};

const FALLBACK_ERROR_MESSAGE =
  "Nu am putut încărca datele. Verifică conexiunea la internet și încearcă din nou.";

/** The API answers in English, so the toast shows a Romanian message chosen by error code. */
function getQueryErrorMessage(error: Error): string {
  const code = isTRPCClientError<AppRouter>(error) ? error.data?.code : undefined;
  if (code && Object.hasOwn(ERROR_MESSAGES, code)) {
    return ERROR_MESSAGES[code] ?? FALLBACK_ERROR_MESSAGE;
  }
  return FALLBACK_ERROR_MESSAGE;
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      toast.error(getQueryErrorMessage(error), {
        action: {
          label: "Încearcă din nou",
          onClick: () => {
            query.invalidate();
          },
        },
      });
    },
  }),
});

const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${process.env.NEXT_PUBLIC_SERVER_URL!.replace(/\/$/, "")}/trpc`,
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: "include",
        });
      },
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});

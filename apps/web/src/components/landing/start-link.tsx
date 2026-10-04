"use client";

import { buttonVariants } from "@my-better-t-app/ui/components/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth-client";

type ButtonStyle = NonNullable<Parameters<typeof buttonVariants>[0]>;

/** Primary call to action: "Începe gratuit" for visitors, "Deschide panoul" once signed in. */
export function StartLink({
  variant,
  size = "lg",
  className,
}: {
  variant?: ButtonStyle["variant"];
  size?: ButtonStyle["size"];
  className?: string;
}) {
  const hydrated = useHydrated();
  const { data: session } = authClient.useSession();
  const signedIn = hydrated && Boolean(session);

  return (
    <Link
      href={signedIn ? "/dashboard" : "/login"}
      className={buttonVariants({ variant, size, className })}
    >
      {signedIn ? "Deschide panoul" : "Începe gratuit"}
      <ArrowRight aria-hidden="true" />
    </Link>
  );
}

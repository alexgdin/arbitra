"use client";

import { buttonVariants } from "@my-better-t-app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@my-better-t-app/ui/components/card";
import { Skeleton } from "@my-better-t-app/ui/components/skeleton";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up";

function AuthSkeleton() {
  return (
    <Card className="shadow-md" aria-busy="true">
      <CardHeader>
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </CardHeader>
      <CardContent className="grid gap-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-11 w-full" />
      </CardContent>
      <span role="status" className="sr-only">
        Se încarcă...
      </span>
    </Card>
  );
}

function SignedInCard({ name, email }: { name: string; email: string }) {
  return (
    <Card className="shadow-md">
      <CardHeader>
        <h1 className="font-semibold text-2xl tracking-tight">Ești deja conectat</h1>
        <CardDescription>
          Ai intrat în contul {name} ({email}).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/dashboard" className={buttonVariants({ size: "lg", className: "w-full" })}>
          Mergi la panou
          <ArrowRight aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}

export default function AuthPanel() {
  const hydrated = useHydrated();
  const { data: session, isPending } = authClient.useSession();
  const [mode, setMode] = useState<Mode>("sign-up");
  const panelRef = useRef<HTMLDivElement>(null);

  function switchTo(next: Mode) {
    setMode(next);
    requestAnimationFrame(() => panelRef.current?.querySelector("h1")?.focus());
  }

  if (!hydrated || isPending) {
    return <AuthSkeleton />;
  }

  if (session) {
    return <SignedInCard name={session.user.name} email={session.user.email} />;
  }

  return (
    <div ref={panelRef}>
      {mode === "sign-in" ? (
        <>
          <SignInForm onSwitchToSignUp={() => switchTo("sign-up")} />
          <p className="mt-4 text-pretty text-center text-muted-foreground text-xs">
            Prin conectare confirmi că folosești Arbitra conform{" "}
            <Link
              href="/termeni"
              className="rounded-sm font-medium text-foreground underline underline-offset-4 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            >
              Termenilor și condițiilor
            </Link>{" "}
            și{" "}
            <Link
              href="/confidentialitate"
              className="rounded-sm font-medium text-foreground underline underline-offset-4 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            >
              Politicii de confidențialitate
            </Link>
            .
          </p>
        </>
      ) : (
        <SignUpForm onSwitchToSignIn={() => switchTo("sign-in")} />
      )}
    </div>
  );
}

import { headers } from "next/headers";

import CookieConsent from "@/components/cookie-consent";
import Footer from "@/components/footer";
import Header from "@/components/header";
import MaintenanceScreen from "@/components/mainenancte-screen";
import { RouteTransition } from "@/components/motion/route-transition";
import { authClient } from "@/lib/auth-client";

const maintenanceActive = process.env.MAINTENANCE_MODE === "false" ? false : true;

export default async function Template({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-arbitra-pathname");
  const isLoginPage = pathname === "/login" || pathname === "/login/";

  let isAdmin = false;

  if (maintenanceActive && !isLoginPage) {
    try {
      const session = await authClient.getSession({
        fetchOptions: {
          headers: requestHeaders,
          cache: "no-store",
          throw: true,
        },
      });

      isAdmin = session?.user.role === "admin";
    } catch {
      // Dacă sesiunea nu poate fi verificată, accesul rămâne blocat.
      console.error("Nu s-a putut verifica sesiunea pentru mentenanță.");
    }
  }

  if (maintenanceActive && !isLoginPage && !isAdmin) {
    return <MaintenanceScreen />;
  }
  if (maintenanceActive && isLoginPage) {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <RouteTransition>{children}</RouteTransition>
    </main>
  );
}
  return (
    <>
      <div className="flex min-h-svh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2.5 focus:font-medium focus:text-primary-foreground focus:text-sm focus:shadow-lg"
        >
          Sari la conținut
        </a>

        <Header />

        <main id="main" className="flex-1">
          <RouteTransition>{children}</RouteTransition>
        </main>

        <Footer />
      </div>

      <CookieConsent />
    </>
  );
}

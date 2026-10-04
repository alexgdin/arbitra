import { headers } from "next/headers";
import { redirect } from "next/navigation";

import DashboardNav from "@/components/dashboard/dashboard-nav";
import { authClient } from "@/lib/auth-client";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
      throw: true,
    },
  });

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <DashboardNav />
      {children}
    </div>
  );
}

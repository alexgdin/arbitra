import type { Metadata } from "next";

import Dashboard from "./dashboard";

export const metadata: Metadata = {
  title: "Prezentare",
};

export default function DashboardPage() {
  return <Dashboard />;
}

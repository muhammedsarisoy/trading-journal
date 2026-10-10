import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const displayName = user.display_name || user.email.split("@")[0] || "Trader";

  return (
    <AppShell userEmail={user.email} displayName={displayName}>
      {children}
    </AppShell>
  );
}

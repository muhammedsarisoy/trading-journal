import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const displayName =
    (user.user_metadata?.display_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Trader";

  return (
    <AppShell userEmail={user.email ?? ""} displayName={displayName}>
      {children}
    </AppShell>
  );
}

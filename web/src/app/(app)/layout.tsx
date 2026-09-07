import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Google gibi sağlayıcılar adı full_name/name ile gönderiyor.
  const meta = user.user_metadata ?? {};
  const displayName =
    (meta.display_name as string | undefined) ||
    (meta.full_name as string | undefined) ||
    (meta.name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Trader";

  return (
    <AppShell userEmail={user.email ?? ""} displayName={displayName}>
      {children}
    </AppShell>
  );
}

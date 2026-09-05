import { createBrowserClient } from "@supabase/ssr";

/** Tarayıcı tarafı Supabase istemcisi (oturum + Storage yüklemeleri). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

/** Tek örnek — bileşenler arasında paylaşılır. */
export function supabaseBrowser() {
  if (!browserClient) browserClient = createClient();
  return browserClient;
}

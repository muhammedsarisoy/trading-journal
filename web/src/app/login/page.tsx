import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CandlestickChart } from "lucide-react";

import { MarketBackdrop } from "@/components/login-art/market-backdrop";
import { LoginForm } from "@/components/login-form";
import { Skeleton } from "@/components/ui/skeleton";
import { safeNext } from "@/lib/safe-next";
import { getAuthProviders, getSessionUser } from "@/lib/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Geçerli oturum varsa giriş ekranı atlanır. Kontrol burada, proxy.ts'de
  // değil: süresi dolmuş bir çerez orada döngüye yol açardı.
  const [user, providers, { next }] = await Promise.all([
    getSessionUser(),
    getAuthProviders(),
    searchParams,
  ]);
  if (user) redirect(safeNext(next));

  return (
    <div className="relative isolate flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden bg-muted p-6 md:p-10">
      {/* Dekoratif mum grafiği; mutlak konumda olduğu için düzeni kaydırmaz. */}
      <MarketBackdrop />

      <div className="relative flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-medium">
          <div className="flex size-7 items-center justify-center rounded-md border bg-card">
            <CandlestickChart className="size-4 text-profit" />
          </div>
          Trading Journal
        </div>

        {/* useSearchParams istemci tarafında çözülür; sınır olmadan build hata verir. */}
        <Suspense fallback={<Skeleton className="h-[420px] w-full rounded-xl" />}>
          <LoginForm google={providers.google} signupEnabled={providers.signup} />
        </Suspense>
      </div>
    </div>
  );
}

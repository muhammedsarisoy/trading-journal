import { Suspense } from "react";
import { CandlestickChart } from "lucide-react";

import { LoginForm } from "@/components/login-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoginPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-medium">
          <div className="flex size-7 items-center justify-center rounded-md border bg-card">
            <CandlestickChart className="size-4 text-profit" />
          </div>
          Trading Journal
        </div>

        {/* useSearchParams istemci tarafında çözülür; sınır olmadan build hata verir. */}
        <Suspense fallback={<Skeleton className="h-[420px] w-full rounded-xl" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}

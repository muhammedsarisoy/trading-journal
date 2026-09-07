"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { supabaseBrowser } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

const ERROR_TR: Record<string, string> = {
  "Invalid login credentials": "E-posta veya parola hatalı.",
  "Email not confirmed": "E-posta doğrulanmamış. Gelen kutunu kontrol et.",
  "User already registered": "Bu e-posta ile zaten bir hesap var.",
  "Password should be at least 6 characters.": "Parola en az 6 karakter olmalı.",
  "Invalid API key":
    "Supabase anahtarı geçersiz. web/.env.local içindeki NEXT_PUBLIC_SUPABASE_ANON_KEY yanlış.",
};

const envMissing =
  !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const isSignup = mode === "signup";
  const busy = loading || googleLoading;

  // OAuth dönüşü hataysa /auth/callback bizi ?error= ile buraya yollar.
  const errorParam = searchParams.get("error");
  useEffect(() => {
    if (!errorParam) return;
    toast.error(ERROR_TR[errorParam] ?? errorParam);
    const params = new URLSearchParams();
    const nextParam = searchParams.get("next");
    if (nextParam) params.set("next", nextParam);
    const query = params.toString();
    router.replace(query ? `/login?${query}` : "/login");
  }, [errorParam, searchParams, router]);

  /**
   * Google ile giriş ve kayıt aynı çağrıdır: hesap yoksa açılır, varsa girilir.
   * Başarılıysa tarayıcı Google'a gider; bu yüzden loading geri alınmaz.
   */
  async function signInWithGoogle() {
    if (envMissing) return;
    setGoogleLoading(true);

    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      toast.error(ERROR_TR[error.message] ?? error.message);
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (envMissing) return;
    setLoading(true);

    const supabase = supabaseBrowser();
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName || email.split("@")[0] } },
        });
        if (error) throw error;

        // E-posta doğrulaması açıksa oturum gelmez; kullanıcıyı bilgilendir.
        if (data.session) {
          router.push(next);
          router.refresh();
        } else {
          toast.success("Kayıt alındı. E-postandaki doğrulama bağlantısına tıkla.");
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(next);
        router.refresh();
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Bilinmeyen hata";
      toast.error(ERROR_TR[raw] ?? raw);
    } finally {
      setLoading(false);
    }
  }

  function switchMode() {
    setMode(isSignup ? "signin" : "signup");
    setPassword("");
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {envMissing && (
        <Alert variant="destructive">
          <AlertTitle>Kurulum eksik</AlertTitle>
          <AlertDescription>
            <code>web/.env.local</code> içinde <code>NEXT_PUBLIC_SUPABASE_URL</code> ve{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> tanımlı değil.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            {isSignup ? "Hesap oluştur" : "Tekrar hoş geldin"}
          </CardTitle>
          <CardDescription>
            {isSignup
              ? "İşlem günlüğünü tutmaya başla."
              : "İşlem günlüğüne devam etmek için giriş yap."}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <Button
                  type="button"
                  variant="outline"
                  onClick={signInWithGoogle}
                  disabled={busy || envMissing}
                >
                  {googleLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <GoogleMark />
                  )}
                  Google ile devam et
                </Button>
              </Field>

              <FieldSeparator className="[&>span]:bg-card">ya da</FieldSeparator>

              {isSignup && (
                <Field>
                  <FieldLabel htmlFor="displayName">Görünen ad</FieldLabel>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Adın"
                    autoComplete="name"
                  />
                  <FieldDescription>
                    Boş bırakırsan e-postanın baş kısmı kullanılır.
                  </FieldDescription>
                </Field>
              )}

              <Field>
                <FieldLabel htmlFor="email">E-posta</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ornek@eposta.com"
                  autoComplete="email"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="password">Parola</FieldLabel>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isSignup ? "En az 6 karakter" : "••••••••"}
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Parolayı gizle" : "Parolayı göster"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
              </Field>

              <Field>
                <Button type="submit" disabled={busy || envMissing}>
                  {loading && <Loader2 className="size-4 animate-spin" />}
                  {isSignup ? "Kayıt ol" : "Giriş yap"}
                </Button>
                <FieldDescription className="text-center">
                  {isSignup ? "Zaten hesabın var mı?" : "Hesabın yok mu?"}{" "}
                  <button
                    type="button"
                    onClick={switchMode}
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    {isSignup ? "Giriş yap" : "Kayıt ol"}
                  </button>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <FieldDescription className="px-6 text-center">
        Kaydettiğin her işlem yalnız sana görünür.
      </FieldDescription>
    </div>
  );
}

/** Google'ın dört renkli "G" işareti — lucide marka ikonu taşımıyor. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18A10.99 10.99 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

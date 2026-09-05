"use client";

import { useState } from "react";
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

  const isSignup = mode === "signup";

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
                <Button type="submit" disabled={loading || envMissing}>
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

import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabase } from "@/lib/supabase/server";

/**
 * OAuth dönüş noktası.
 *
 * Sağlayıcı (Google) kullanıcıyı buraya bir `code` ile geri yollar; kod burada
 * oturuma çevrilir ve çerezler yazılır. PKCE doğrulayıcısı tarayıcı istemcisi
 * tarafından çerezde tutulduğu için değişim sunucuda yapılabiliyor.
 *
 * proxy.ts `/auth` yolunu herkese açık bıraktığından buraya oturumsuz gelinir.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = baseURL(request);

  const fail = (message: string) => {
    const url = new URL("/login", origin);
    url.searchParams.set("error", message);
    return NextResponse.redirect(url);
  };

  // Kullanıcı izni reddettiyse Supabase hatayı sorgu dizisinde döndürür.
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) return fail(providerError);

  const code = searchParams.get("code");
  if (!code) return fail("Yetkilendirme kodu alınamadı.");

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.message);

  return NextResponse.redirect(new URL(safeNext(searchParams.get("next")), origin));
}

/** Açık yönlendirmeyi engeller: yalnız kendi içimizde bir yol kabul edilir. */
function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

/** Ters vekil arkasındayken iç konak adına değil dış adrese dönülür. */
function baseURL(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host");
  if (process.env.NODE_ENV === "production" && host) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  return request.nextUrl.origin;
}

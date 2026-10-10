import { cookies } from "next/headers";

import type { AuthProviders } from "@/lib/api";

/** Oturum jetonunu taşıyan çerez (Go API yazar, HttpOnly). */
export const SESSION_COOKIE = "tj_session";

/**
 * Go API'nin iç ağdaki adresi. Yalnız sunucuda okunur, istemci paketine
 * girmez; çalışma anında değiştirilebilir (derleme gerektirmez).
 */
export function apiInternalURL() {
  return (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");
}

export type SessionUser = {
  user_id: string;
  email: string;
  display_name: string;
};

/**
 * Sunucu bileşenlerinde oturum sahibini döner; oturum yoksa ya da geçersizse
 * null. Doğrulamayı API yapar: çerezin varlığı tek başına yeterli değil.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const res = await fetch(`${apiInternalURL()}/api/v1/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as SessionUser;
  } catch {
    return null;
  }
}

/** Giriş ekranında hangi seçeneklerin gösterileceği. */
export async function getAuthProviders(): Promise<AuthProviders> {
  try {
    const res = await fetch(`${apiInternalURL()}/api/v1/auth/providers`, { cache: "no-store" });
    if (res.ok) return (await res.json()) as AuthProviders;
  } catch {
    // API kapalıysa form yine görünsün; giriş denemesi hatayı gösterir.
  }
  return { google: false, signup: true };
}

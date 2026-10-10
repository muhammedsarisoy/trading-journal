import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/session";

const PUBLIC_PATHS = ["/login"];

/**
 * Oturum çerezi olmayan isteği korumalı sayfalardan /login'e yollar.
 *
 * Bu yalnız iyimser bir ön kontrol: çerezin geçerli olup olmadığını
 * (app)/layout.tsx API'ye sorarak doğrular. Burada API çağrılmaz ki her
 * sayfa geçişi fazladan bir ağ isteği beklemesin.
 */
export default function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSession && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  // /api hariç: oradaki istekler gövdesiyle birlikte Go API'ye akar ve
  // oturumu API kendisi doğrular.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

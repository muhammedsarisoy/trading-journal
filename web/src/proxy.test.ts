import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import proxy, { config } from "./proxy";

function req(path: string, cookie?: string) {
  return new NextRequest(`http://journal.test${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

describe("proxy (oturum ön kontrolü)", () => {
  it("çerezsiz isteği giriş sayfasına yollar ve dönüş yolunu korur", () => {
    const res = proxy(req("/trades/abc?tab=1"));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/trades/abc");
  });

  it("oturum çerezi varsa geçirir (asıl doğrulamayı layout yapar)", () => {
    const res = proxy(req("/dashboard", "tj_session=herhangi"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("boş çerez oturum sayılmaz", () => {
    expect(proxy(req("/dashboard", "tj_session=")).status).toBe(307);
  });

  it("giriş sayfası çerezsiz açılır; çerez varken de döngüye girmez", () => {
    expect(proxy(req("/login")).headers.get("location")).toBeNull();
    // Süresi dolmuş çerezle /login'den /dashboard'a atılsaydı, layout tekrar
    // /login'e yollar ve sonsuz döngü olurdu.
    expect(proxy(req("/login", "tj_session=eski")).headers.get("location")).toBeNull();
  });

  it("matcher /api yolunu dışarıda bırakır (yükleme gövdesi kesilmesin)", () => {
    const re = new RegExp(`^${config.matcher[0]}$`);
    for (const p of ["/api/v1/trades", "/api/v1/trades/x/screenshots", "/_next/static/a.js", "/logo.png"]) {
      expect(re.test(p), p).toBe(false);
    }
    for (const p of ["/", "/dashboard", "/trades/abc", "/login", "/apiary"]) {
      expect(re.test(p), p).toBe(true);
    }
  });
});

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, GET, POST } from "./route";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("API_INTERNAL_URL", "http://api:8080/");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

function req(path: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return new NextRequest(`http://journal.test${path}`, init);
}

/** fetch'e giden son çağrının adresi ve seçenekleri. */
function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), init: init as RequestInit & { duplex?: string }, headers: new Headers(init!.headers) };
}

describe("API aktarıcısı", () => {
  it("yolu, sorguyu ve yöntemi API'ye aynen taşır", async () => {
    fetchMock.mockResolvedValue(Response.json([{ id: 1 }]));

    const res = await GET(req("/api/v1/trades?symbol=EURUSD&limit=5"));

    const { url, init } = lastCall();
    expect(url).toBe("http://api:8080/api/v1/trades?symbol=EURUSD&limit=5");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.redirect).toBe("manual");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 1 }]);
  });

  it("çerezi ve Origin'i iletir, bağlantıya özgü başlıkları atar", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await POST(
      req("/api/v1/auth/logout", {
        method: "POST",
        headers: {
          cookie: "tj_session=abc",
          origin: "http://journal.test",
          connection: "keep-alive",
          expect: "100-continue",
          "content-length": "0",
        },
      }),
    );

    const { headers } = lastCall();
    expect(headers.get("cookie")).toBe("tj_session=abc");
    expect(headers.get("origin")).toBe("http://journal.test");
    expect(headers.get("x-forwarded-host")).toBe("journal.test");
    expect(headers.get("x-forwarded-proto")).toBe("http");
    // Node fetch "expect" başlığında hata fırlatır; diğerleri bir sonraki atlamaya ait değil.
    for (const h of ["connection", "expect", "content-length", "host"]) {
      expect(headers.has(h), h).toBe(false);
    }
  });

  it("ters vekilin yazdığı x-forwarded-* değerlerini ezmez", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await GET(
      req("/api/v1/me", {
        headers: { "x-forwarded-proto": "https", "x-forwarded-host": "journal.example.com" },
      }),
    );

    const { headers } = lastCall();
    expect(headers.get("x-forwarded-proto")).toBe("https");
    expect(headers.get("x-forwarded-host")).toBe("journal.example.com");
  });

  it("gövdeyi akış halinde iletir", async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }, { status: 201 }));

    await POST(
      req("/api/v1/trades", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol: "XAUUSD" }),
      }),
    );

    const { init } = lastCall();
    expect(init.duplex).toBe("half");
    expect(init.body).toBeInstanceOf(ReadableStream);
    expect(await new Response(init.body).json()).toEqual({ symbol: "XAUUSD" });
  });

  it("birden fazla Set-Cookie'yi ve yönlendirmeyi tarayıcıya geçirir", async () => {
    const headers = new Headers({ location: "https://accounts.google.com/o/oauth2/auth?x=1" });
    headers.append("set-cookie", "tj_oauth=a; Path=/api/v1/auth/google; HttpOnly");
    headers.append("set-cookie", "tj_session=; Max-Age=0");
    fetchMock.mockResolvedValue(new Response(null, { status: 302, headers }));

    const res = await GET(req("/api/v1/auth/google/start?next=%2Ftrades"));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://accounts.google.com/o/oauth2/auth?x=1");
    expect(res.headers.getSetCookie()).toEqual([
      "tj_oauth=a; Path=/api/v1/auth/google; HttpOnly",
      "tj_session=; Max-Age=0",
    ]);
  });

  it("fetch'in açtığı sıkıştırmanın başlığını yanıttan çıkarır", async () => {
    fetchMock.mockResolvedValue(
      new Response("{}", { headers: { "content-encoding": "gzip", "content-length": "99", "content-type": "application/json" } }),
    );

    const res = await GET(req("/api/v1/me"));

    expect(res.headers.has("content-encoding")).toBe(false);
    expect(res.headers.has("content-length")).toBe(false);
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  it("10 MB sınırını aşan isteği API'ye hiç göndermeden 413 ile reddeder", async () => {
    const res = await POST(
      req("/api/v1/trades/x/screenshots", {
        method: "POST",
        headers: { "content-length": String(11 * 1024 * 1024) },
        body: "x",
      }),
    );

    expect(res.status).toBe(413);
    expect((await res.json()).error.message).toMatch(/10 MB/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("API'ye ulaşılamazsa 502 ve okunabilir hata döner", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const res = await DELETE(req("/api/v1/trades/x", { method: "DELETE" }));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: { message: "API'ye ulaşılamadı" } });
  });

  it("API hata durumlarını değiştirmeden geçirir", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { message: "Kayıt bulunamadı" } }, { status: 404 }));
    const res = await GET(req("/api/v1/trades/yok"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.message).toBe("Kayıt bulunamadı");
  });
});

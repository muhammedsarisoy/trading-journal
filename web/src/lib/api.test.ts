import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, authApi, notesApi, screenshotsApi, tradesApi } from "./api";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), init: init!, headers: new Headers(init!.headers) };
}

describe("API istemcisi", () => {
  it("aynı origin'e, çerezle ve JSON olarak istek atar", async () => {
    fetchMock.mockResolvedValue(Response.json({ items: [], total: 0 }));

    await tradesApi.list({ symbol: "EURUSD", setup: "", limit: 10 });

    const { url, init, headers } = lastCall();
    // Sondaki "/" Next'te her istekte fazladan bir yönlendirmeye yol açıyordu.
    expect(url).toBe("/api/v1/trades?symbol=EURUSD&limit=10");
    expect(init.credentials).toBe("same-origin");
    expect(init.cache).toBe("no-store");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.has("authorization")).toBe(false);
  });

  it("API'nin hata mesajını ApiError olarak fırlatır", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: { message: "E-posta veya parola hatalı." } }, { status: 401 }),
    );

    const err = await authApi.login("a@b.co", "x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401, message: "E-posta veya parola hatalı." });
  });

  it("204 yanıtında gövde beklemez", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(authApi.logout()).resolves.toBeUndefined();
    expect(lastCall().init.method).toBe("POST");
  });

  it("görseli multipart olarak yükler; Content-Type'ı tarayıcıya bırakır", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: "s1" }, { status: 201 }));
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "grafik.png", { type: "image/png" });

    await screenshotsApi.upload("t1", file, { phase: "exit", caption: "giriş" });

    const { url, init, headers } = lastCall();
    expect(url).toBe("/api/v1/trades/t1/screenshots");
    // Elle verilen Content-Type multipart sınırını (boundary) bozar.
    expect(headers.has("content-type")).toBe(false);
    const form = init.body as FormData;
    // API gövdeyi akış halinde okur: metin alanları dosyadan önce gelmeli.
    expect([...form.keys()]).toEqual(["phase", "caption", "file"]);
    expect(form.get("phase")).toBe("exit");
    expect((form.get("file") as File).name).toBe("grafik.png");
  });

  it("10 MB üstü dosyayı ağa çıkmadan reddeder", async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "b.png", { type: "image/png" });
    await expect(screenshotsApi.upload("t1", big)).rejects.toMatchObject({ status: 413 });
    await expect(notesApi.uploadImage("l1", big)).rejects.toMatchObject({ status: 413 });
    await expect(
      notesApi.uploadImage("l1", new File(["x"], "a.txt", { type: "text/plain" })),
    ).rejects.toMatchObject({ status: 415 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ders görselinin yolunu döner", async () => {
    fetchMock.mockResolvedValue(Response.json({ path: "u/l/x.png" }, { status: 201 }));
    await expect(notesApi.uploadImage("l1", new File(["x"], "a.png", { type: "image/png" }))).resolves.toBe(
      "u/l/x.png",
    );
    expect(lastCall().url).toBe("/api/v1/lessons/l1/images");
  });

  it("görsel adreslerini aynı origin'de, parça parça kodlayarak üretir", () => {
    expect(screenshotsApi.url("u1/t1/a b#.png")).toBe("/api/v1/files/trade-screenshots/u1/t1/a%20b%23.png");
    expect(notesApi.imageUrl("u1/l1/x.png")).toBe("/api/v1/files/lesson-images/u1/l1/x.png");
  });

  it("Google girişini dönüş yoluyla başlatır", () => {
    expect(authApi.googleStartUrl("/trades?x=1&y=2")).toBe(
      "/api/v1/auth/google/start?next=%2Ftrades%3Fx%3D1%26y%3D2",
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

const { getAuthProviders, getSessionUser } = await import("./session");

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("API_INTERNAL_URL", "http://api:8080");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  cookieStore.get.mockReset();
});

describe("getSessionUser", () => {
  it("çerez yoksa API'yi hiç çağırmadan null döner", async () => {
    cookieStore.get.mockReturnValue(undefined);
    await expect(getSessionUser()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("oturumu API'ye sorar: yalnız oturum çerezini iç adrese gönderir", async () => {
    cookieStore.get.mockReturnValue({ value: "jeton" });
    const user = { user_id: "u1", email: "a@b.co", display_name: "Ali" };
    fetchMock.mockResolvedValue(Response.json(user));

    await expect(getSessionUser()).resolves.toEqual(user);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api:8080/api/v1/me");
    expect(new Headers(init!.headers).get("cookie")).toBe("tj_session=jeton");
  });

  it("geçersiz oturumda ya da API kapalıyken null döner", async () => {
    cookieStore.get.mockReturnValue({ value: "eski" });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(getSessionUser()).resolves.toBeNull();

    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(getSessionUser()).resolves.toBeNull();
  });
});

describe("getAuthProviders", () => {
  it("API'nin söylediğini döner", async () => {
    fetchMock.mockResolvedValue(Response.json({ google: true, signup: false }));
    await expect(getAuthProviders()).resolves.toEqual({ google: true, signup: false });
  });

  it("API kapalıysa formu yine gösterecek varsayılana düşer", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(getAuthProviders()).resolves.toEqual({ google: false, signup: true });
  });
});

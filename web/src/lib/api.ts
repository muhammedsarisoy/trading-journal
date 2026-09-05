import { supabaseBrowser } from "@/lib/supabase/client";
import { MAX_SCREENSHOT_BYTES, SCREENSHOT_BUCKET } from "@/lib/constants";
import type {
  BreakdownDim,
  BreakdownRow,
  Bucket,
  DistinctValues,
  Fund,
  FundInput,
  Platform,
  Screenshot,
  SeriesPoint,
  Summary,
  Trade,
  TradeInput,
  TradeList,
  TradeQuery,
} from "@/lib/types";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function accessToken() {
  const {
    data: { session },
  } = await supabaseBrowser().auth.getSession();
  if (!session) throw new ApiError("Oturum bulunamadı", 401);
  return session.access_token;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();

  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = body?.error?.message ?? `İstek başarısız (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return body as T;
}

function qs(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

// ------------------------------------------------------------------ Fonlar

export const fundsApi = {
  list: () => request<Fund[]>("/funds/"),
  create: (input: FundInput) =>
    request<Fund>("/funds/", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: FundInput) =>
    request<Fund>(`/funds/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  seed: (funds: Partial<FundInput>[]) =>
    request<Fund[]>("/funds/seed", { method: "POST", body: JSON.stringify({ funds }) }),
  remove: (id: string) => request<void>(`/funds/${id}`, { method: "DELETE" }),
};

// ------------------------------------------------------------- Platformlar

export const platformsApi = {
  list: () => request<Platform[]>("/platforms/"),
  create: (name: string) =>
    request<Platform>("/platforms/", { method: "POST", body: JSON.stringify({ name }) }),
  seed: (names: string[]) =>
    request<Platform[]>("/platforms/seed", { method: "POST", body: JSON.stringify({ names }) }),
  remove: (id: string) => request<void>(`/platforms/${id}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------- İşlemler

export const tradesApi = {
  list: (query: TradeQuery = {}) => request<TradeList>(`/trades/${qs({ ...query })}`),
  get: (id: string) => request<Trade>(`/trades/${id}`),
  create: (input: TradeInput) =>
    request<Trade>("/trades/", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: TradeInput) =>
    request<Trade>(`/trades/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  remove: (id: string) =>
    request<{ removed_paths: string[] }>(`/trades/${id}`, { method: "DELETE" }),
  distinct: () => request<DistinctValues>("/meta/distinct"),
};

// ---------------------------------------------------------------- Raporlar

export const statsApi = {
  summary: (query: TradeQuery = {}) => request<Summary>(`/stats/summary${qs({ ...query })}`),
  series: (bucket: Bucket, query: TradeQuery = {}) =>
    request<SeriesPoint[]>(`/stats/series${qs({ ...query, bucket })}`),
  breakdown: (by: BreakdownDim, query: TradeQuery = {}) =>
    request<BreakdownRow[]>(`/stats/breakdown${qs({ ...query, by })}`),
};

// -------------------------------------------------------- Ekran görüntüleri

export const screenshotsApi = {
  list: (tradeId: string) => request<Screenshot[]>(`/trades/${tradeId}/screenshots`),

  /**
   * Dosya doğrudan Supabase Storage'a yüklenir (RLS klasör politikası uygular),
   * ardından yolu Go API'ye kaydedilir.
   */
  async upload(
    tradeId: string,
    file: File,
    opts: { phase?: string; caption?: string | null } = {},
  ): Promise<Screenshot> {
    if (file.size > MAX_SCREENSHOT_BYTES) {
      throw new ApiError("Dosya 10 MB sınırını aşıyor", 413);
    }

    const supabase = supabaseBrowser();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ApiError("Oturum bulunamadı", 401);

    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${user.id}/${tradeId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from(SCREENSHOT_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new ApiError(`Yükleme başarısız: ${error.message}`, 500);

    try {
      return await request<Screenshot>(`/trades/${tradeId}/screenshots`, {
        method: "POST",
        body: JSON.stringify({ path, phase: opts.phase ?? "entry", caption: opts.caption ?? null }),
      });
    } catch (err) {
      // Kayıt açılamadıysa yüklenen dosyayı geride bırakma.
      await supabase.storage.from(SCREENSHOT_BUCKET).remove([path]);
      throw err;
    }
  },

  async remove(shot: Screenshot) {
    await request<{ removed_path: string }>(`/screenshots/${shot.id}`, { method: "DELETE" });
    await supabaseBrowser().storage.from(SCREENSHOT_BUCKET).remove([shot.path]);
  },

  /** Özel bucket olduğu için görüntüleme imzalı bağlantı ister. */
  async signedUrl(path: string, expiresIn = 3600) {
    const { data, error } = await supabaseBrowser()
      .storage.from(SCREENSHOT_BUCKET)
      .createSignedUrl(path, expiresIn);
    if (error) throw new ApiError(error.message, 500);
    return data.signedUrl;
  },
};

/** İşlem silindiğinde Storage'ta kalan dosyaları temizler. */
export async function removeStoragePaths(paths: string[]) {
  if (!paths.length) return;
  await supabaseBrowser().storage.from(SCREENSHOT_BUCKET).remove(paths);
}

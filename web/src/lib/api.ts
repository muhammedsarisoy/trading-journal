import {
  LESSON_IMAGE_BUCKET,
  MAX_LESSON_IMAGE_BYTES,
  MAX_SCREENSHOT_BYTES,
  SCREENSHOT_BUCKET,
} from "@/lib/constants";
import type {
  BreakdownDim,
  BreakdownRow,
  Bucket,
  Course,
  CourseInput,
  DistinctValues,
  Fund,
  FundInput,
  Lesson,
  LessonInput,
  LessonNote,
  LessonNoteInput,
  Platform,
  PropKind,
  PropSummary,
  PropTransaction,
  PropTransactionInput,
  Screenshot,
  SeriesPoint,
  Summary,
  Trade,
  TradeInput,
  TradeList,
  TradeQuery,
} from "@/lib/types";

/**
 * API aynı origin'de, /api altında: istekler Next üzerinden Go API'ye
 * aktarılır (bkz. app/api/[...path]/route.ts). Oturum HttpOnly çerezde
 * durduğu için jeton taşımaya gerek yok; tarayıcı çerezi kendisi ekler.
 */
const API_BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // FormData gövdesinde sınır (boundary) değerini tarayıcı yazar; elle
  // Content-Type verilirse yükleme bozulur.
  const isForm = init.body instanceof FormData;

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(init.headers ?? {}),
    },
    credentials: "same-origin",
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
  list: () => request<Fund[]>("/funds"),
  create: (input: FundInput) =>
    request<Fund>("/funds", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: FundInput) =>
    request<Fund>(`/funds/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  seed: (funds: Partial<FundInput>[]) =>
    request<Fund[]>("/funds/seed", { method: "POST", body: JSON.stringify({ funds }) }),
  remove: (id: string) => request<void>(`/funds/${id}`, { method: "DELETE" }),
};

// ------------------------------------------------------------- Platformlar

export const platformsApi = {
  list: () => request<Platform[]>("/platforms"),
  create: (name: string) =>
    request<Platform>("/platforms", { method: "POST", body: JSON.stringify({ name }) }),
  seed: (names: string[]) =>
    request<Platform[]>("/platforms/seed", { method: "POST", body: JSON.stringify({ names }) }),
  remove: (id: string) => request<void>(`/platforms/${id}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------- İşlemler

export const tradesApi = {
  list: (query: TradeQuery = {}) => request<TradeList>(`/trades${qs({ ...query })}`),
  get: (id: string) => request<Trade>(`/trades/${id}`),
  create: (input: TradeInput) =>
    request<Trade>("/trades", { method: "POST", body: JSON.stringify(input) }),
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
   * Dosya API'ye yüklenir; API türünü baytlardan doğrular, diske yazar ve
   * kaydı açar. phase ve caption dosyadan önce gönderilir.
   */
  async upload(
    tradeId: string,
    file: File,
    opts: { phase?: string; caption?: string | null } = {},
  ): Promise<Screenshot> {
    if (file.size > MAX_SCREENSHOT_BYTES) {
      throw new ApiError("Dosya 10 MB sınırını aşıyor", 413);
    }
    const form = new FormData();
    form.append("phase", opts.phase ?? "entry");
    if (opts.caption) form.append("caption", opts.caption);
    form.append("file", file);
    return request<Screenshot>(`/trades/${tradeId}/screenshots`, { method: "POST", body: form });
  },

  /** Kayıt silinince dosyayı da API kaldırır. */
  remove: (shot: Screenshot) =>
    request<{ removed_path: string }>(`/screenshots/${shot.id}`, { method: "DELETE" }),

  /** Görsel adresi. Oturum çerezi aynı origin'e gittiği için imza gerekmez. */
  url: (path: string) => fileUrl(SCREENSHOT_BUCKET, path),
};

function fileUrl(bucket: string, path: string) {
  return `${API_BASE}/files/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

// ------------------------------------------------------------------ Eğitim

export const coursesApi = {
  list: () => request<Course[]>("/courses"),
  get: (id: string) => request<Course>(`/courses/${id}`),
  create: (input: CourseInput) =>
    request<Course>("/courses", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: CourseInput) =>
    request<Course>(`/courses/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  /** Eğitimle birlikte günleri, notları ve görselleri de gider. */
  remove: (id: string) =>
    request<{ removed_paths: string[] }>(`/courses/${id}`, { method: "DELETE" }),
};

export const lessonsApi = {
  list: (courseId: string) => request<Lesson[]>(`/courses/${courseId}/lessons`),
  get: (id: string) => request<Lesson>(`/lessons/${id}`),
  create: (courseId: string, input: LessonInput) =>
    request<Lesson>(`/courses/${courseId}/lessons`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (id: string, input: LessonInput) =>
    request<Lesson>(`/lessons/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  remove: (id: string) =>
    request<{ removed_paths: string[] }>(`/lessons/${id}`, { method: "DELETE" }),
};

export const notesApi = {
  list: (lessonId: string) => request<LessonNote[]>(`/lessons/${lessonId}/notes`),
  create: (lessonId: string, input: LessonNoteInput) =>
    request<LessonNote>(`/lessons/${lessonId}/notes`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** Görsel değiştiyse ya da kaldırıldıysa eskisini API siler. */
  update: (id: string, input: LessonNoteInput) =>
    request<LessonNote>(`/notes/${id}`, { method: "PUT", body: JSON.stringify(input) }),

  /** Blok silinince görseli de API kaldırır. */
  remove: (id: string) => request<{ removed_path: string }>(`/notes/${id}`, { method: "DELETE" }),

  reorder: (lessonId: string, ids: string[]) =>
    request<LessonNote[]>(`/lessons/${lessonId}/notes/reorder`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  /** Grafik görseli API'ye yüklenir; not bloğu yalnız dönen yolu tutar. */
  async uploadImage(lessonId: string, file: File): Promise<string> {
    if (!file.type.startsWith("image/")) {
      throw new ApiError("Yalnız görsel yüklenebilir", 415);
    }
    if (file.size > MAX_LESSON_IMAGE_BYTES) {
      throw new ApiError("Dosya 10 MB sınırını aşıyor", 413);
    }
    const form = new FormData();
    form.append("file", file);
    const { path } = await request<{ path: string }>(`/lessons/${lessonId}/images`, {
      method: "POST",
      body: form,
    });
    return path;
  },

  imageUrl: (path: string) => fileUrl(LESSON_IMAGE_BUCKET, path),
};

// -------------------------------------------------------------------- Prop

export const propApi = {
  summary: () => request<PropSummary>("/prop/summary"),
  list: (query: { firm?: string; kind?: PropKind } = {}) =>
    request<PropTransaction[]>(`/prop/transactions${qs(query)}`),
  create: (input: PropTransactionInput) =>
    request<PropTransaction>("/prop/transactions", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: PropTransactionInput) =>
    request<PropTransaction>(`/prop/transactions/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  remove: (id: string) => request<void>(`/prop/transactions/${id}`, { method: "DELETE" }),
};

// ------------------------------------------------------------------ Oturum

export type AuthProviders = { google: boolean; signup: boolean };

export const authApi = {
  login: (email: string, password: string) =>
    request<{ user_id: string; email: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signup: (email: string, password: string, displayName: string) =>
    request<{ user_id: string; email: string }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, display_name: displayName }),
    }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  /** Tarayıcı bu adrese gider; API Google'a yönlendirir ve dönüşte oturumu açar. */
  googleStartUrl: (next: string) => `${API_BASE}/auth/google/start?next=${encodeURIComponent(next)}`,
};

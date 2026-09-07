import { supabaseBrowser } from "@/lib/supabase/client";
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

// ------------------------------------------------------------------ Eğitim

export const coursesApi = {
  list: () => request<Course[]>("/courses/"),
  get: (id: string) => request<Course>(`/courses/${id}`),
  create: (input: CourseInput) =>
    request<Course>("/courses/", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: CourseInput) =>
    request<Course>(`/courses/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  /** Eğitimle birlikte günleri ve notları da gider; görseller Storage'tan silinir. */
  async remove(id: string) {
    const { removed_paths } = await request<{ removed_paths: string[] }>(`/courses/${id}`, {
      method: "DELETE",
    });
    await removeLessonImages(removed_paths);
  },
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
  async remove(id: string) {
    const { removed_paths } = await request<{ removed_paths: string[] }>(`/lessons/${id}`, {
      method: "DELETE",
    });
    await removeLessonImages(removed_paths);
  },
};

export const notesApi = {
  list: (lessonId: string) => request<LessonNote[]>(`/lessons/${lessonId}/notes`),
  create: (lessonId: string, input: LessonNoteInput) =>
    request<LessonNote>(`/lessons/${lessonId}/notes`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (id: string, input: LessonNoteInput) =>
    request<LessonNote>(`/notes/${id}`, { method: "PUT", body: JSON.stringify(input) }),

  /** Blok silinince görseli de Storage'tan kaldırılır. */
  async remove(id: string) {
    const { removed_path } = await request<{ removed_path: string }>(`/notes/${id}`, {
      method: "DELETE",
    });
    if (removed_path) await removeLessonImages([removed_path]);
  },

  reorder: (lessonId: string, ids: string[]) =>
    request<LessonNote[]>(`/lessons/${lessonId}/notes/reorder`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  /** Grafik görseli doğrudan Storage'a yüklenir; not bloğu yalnız yolu tutar. */
  async uploadImage(lessonId: string, file: File): Promise<string> {
    if (!file.type.startsWith("image/")) {
      throw new ApiError("Yalnız görsel yüklenebilir", 415);
    }
    if (file.size > MAX_LESSON_IMAGE_BYTES) {
      throw new ApiError("Dosya 10 MB sınırını aşıyor", 413);
    }

    const supabase = supabaseBrowser();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ApiError("Oturum bulunamadı", 401);

    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${user.id}/${lessonId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from(LESSON_IMAGE_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new ApiError(`Yükleme başarısız: ${error.message}`, 500);

    return path;
  },

  /** Özel bucket olduğu için görüntüleme imzalı bağlantı ister. */
  async signedUrl(path: string, expiresIn = 3600) {
    const { data, error } = await supabaseBrowser()
      .storage.from(LESSON_IMAGE_BUCKET)
      .createSignedUrl(path, expiresIn);
    if (error) throw new ApiError(error.message, 500);
    return data.signedUrl;
  },
};

/** Ders görsellerini Storage'tan kaldırır. */
export async function removeLessonImages(paths: string[]) {
  if (!paths.length) return;
  await supabaseBrowser().storage.from(LESSON_IMAGE_BUCKET).remove(paths);
}

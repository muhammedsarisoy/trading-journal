import { type NextRequest } from "next/server";

import { apiInternalURL } from "@/lib/session";

/**
 * /api/* isteklerini Go API'ye olduğu gibi aktarır.
 *
 * Tarayıcı yalnız web uygulamasının origin'ini görür: oturum çerezi HttpOnly
 * ve first-party kalır, CORS gerekmez, API'nin dışarıya açılması gerekmez.
 *
 * Gövde akış halinde iletilir (belleğe alınmaz). proxy.ts bu yolu eşlemez;
 * eşleseydi Next gövdeyi 10 MB'ta keserdi (proxyClientMaxBodySize).
 */

// Bağlantıya özgü başlıklar bir sonraki atlamaya taşınmaz.
const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  // Node fetch bu başlığı kabul etmiyor; curl 1 MB üstü gövdelerde ekliyor.
  "expect",
];

// API'nin kabul ettiği en büyük gövde (10 MB dosya + multipart payı). Aşan
// istek baştan reddedilir: API sınırı görünce bağlantıyı kapatır ve gövde
// hâlâ gönderilirken fetch bunu 413 yerine ağ hatası olarak görür.
const MAX_BODY_BYTES = 10 * 1024 * 1024 + 64 * 1024;

async function forward(request: NextRequest) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return Response.json({ error: { message: "Dosya 10 MB sınırını aşıyor" } }, { status: 413 });
  }

  const target = `${apiInternalURL()}${request.nextUrl.pathname}${request.nextUrl.search}`;

  const headers = new Headers(request.headers);
  for (const h of HOP_BY_HOP) headers.delete(h);
  headers.set("x-forwarded-host", request.headers.get("host") ?? "");
  headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""));

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // Google dönüşündeki yönlendirmeler tarayıcıya aynen gitmeli.
      redirect: "manual",
      cache: "no-store",
      // Akış halindeki gövde için Node fetch bunu istiyor.
      ...(hasBody ? { duplex: "half" } : {}),
    } as RequestInit);
  } catch (err) {
    console.error("API aktarımı başarısız", request.method, request.nextUrl.pathname, err);
    return Response.json({ error: { message: "API'ye ulaşılamadı" } }, { status: 502 });
  }

  const out = new Headers(upstream.headers);
  // fetch gövdeyi zaten açtı; bu başlıklar artık yanlış olur.
  for (const h of ["content-encoding", "content-length", "transfer-encoding", "connection"]) {
    out.delete(h);
  }

  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const GET = forward;
export const HEAD = forward;
export const POST = forward;
export const PUT = forward;
export const DELETE = forward;

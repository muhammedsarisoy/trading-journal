import type { NextConfig } from "next";

// Supabase oturum cookie'leri @supabase/ssr tasarımı gereği httpOnly DEĞİL —
// tarayıcı istemcisi onları okumak zorunda. Bu yüzden bir XSS doğrudan oturum
// çalınmasına dönüşür ve CSP tek gerçek savunma katmanı olur.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").origin;
  } catch {
    return "";
  }
})();

const csp = [
  `default-src 'self'`,
  // Next istemci önyüklemesi satır içi script üretiyor. Bunu kaldırmak için
  // nonce gerekir; şimdilik politika Report-Only modunda uygulanıyor.
  `script-src 'self' 'unsafe-inline'`,
  `style-src 'self' 'unsafe-inline'`,
  // Yazı tipleri next/font ile derleme anında kendi sunucumuza indiriliyor.
  `font-src 'self'`,
  // blob: bekleyen ekran görüntülerinin yerel önizlemesi için.
  `img-src 'self' data: blob: ${supabaseOrigin}`,
  `connect-src 'self' ${supabaseOrigin} ${apiOrigin}`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  // CSP önce Report-Only: tarayıcı konsolunda ihlal görünmüyorsa
  // başlık adı Content-Security-Policy olarak değiştirilip zorunlu kılınmalı.
  { key: "Content-Security-Policy-Report-Only", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  // Docker imajı için: bağımlılıkları tek klasöre toplayan minimal sunucu çıktısı.
  output: "standalone",

  // Sunucu sürümünü sızdırmaz.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

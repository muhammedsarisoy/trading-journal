import type { NextConfig } from "next";

// Oturum çerezi HttpOnly: JavaScript onu okuyamaz, bu yüzden bir XSS oturum
// jetonunu doğrudan çalamaz. API ve görseller aynı origin'den (/api) geldiği
// için politikada dış kaynak yok.
const csp = [
  `default-src 'self'`,
  // Next istemci önyüklemesi satır içi script üretiyor. Bunu kaldırmak için
  // nonce gerekir; şimdilik politika Report-Only modunda uygulanıyor.
  `script-src 'self' 'unsafe-inline'`,
  `style-src 'self' 'unsafe-inline'`,
  // Yazı tipleri next/font ile derleme anında kendi sunucumuza indiriliyor.
  `font-src 'self'`,
  // blob: bekleyen ekran görüntülerinin yerel önizlemesi için.
  `img-src 'self' data: blob:`,
  `connect-src 'self'`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  // Google ile giriş /api üzerinden başlar; dış form hedefi yok.
  `form-action 'self'`,
  `object-src 'none'`,
].join("; ");

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

  // Takvim İşlemler'in, Analiz Panel'in içine taşındı; eski yer imleri çalışsın.
  async redirects() {
    return [
      { source: "/calendar", destination: "/trades?view=calendar", permanent: true },
      { source: "/analytics", destination: "/dashboard", permanent: true },
    ];
  },
};

export default nextConfig;

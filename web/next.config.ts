import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker imajı için: bağımlılıkları tek klasöre toplayan minimal sunucu çıktısı.
  output: "standalone",
};

export default nextConfig;

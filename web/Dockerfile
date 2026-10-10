# ---------- bağımlılıklar ----------
FROM node:26-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- derleme ----------
FROM node:26-alpine AS build

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# İstemci paketine gömülen ayar yok: API adresi (API_INTERNAL_URL) yalnız
# sunucuda, çalışma anında okunur. Aynı imaj her ortamda kullanılabilir.
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ---------- çalıştırma ----------
FROM node:26-alpine AS run

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    API_INTERNAL_URL=http://api:8080

RUN addgroup -g 1001 nodejs && adduser -D -u 1001 -G nodejs nextjs

# standalone çıktısı: sunucu + yalnız gerçekten kullanılan node_modules
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/login >/dev/null || exit 1

CMD ["node", "server.js"]

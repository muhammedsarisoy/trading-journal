# ---------- bağımlılıklar ----------
FROM node:24-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- derleme ----------
FROM node:24-alpine AS build

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* değerleri istemci paketine gömülür, yani herkese açıktır.
# .env dosyaları imaja kopyalanmaz (bkz. .dockerignore); değerler yalnız
# buradan, açıkça geçer.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_URL=http://localhost:8080

# Gizli anahtarın istemci paketine gömülmesini derlemede durdur.
RUN set -e; \
    if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then \
      echo "HATA: NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY zorunlu."; \
      echo "      docker compose --env-file web/.env.local up -d --build"; \
      exit 1; \
    fi; \
    case "$NEXT_PUBLIC_SUPABASE_ANON_KEY" in \
      sb_secret_*|*service_role*) \
        echo "HATA: NEXT_PUBLIC_SUPABASE_ANON_KEY gizli anahtar gibi duruyor."; \
        echo "      Bu deger tarayiciya gonderilen pakete gomulur ve RLS'i bypass eder."; \
        echo "      anon / publishable anahtari kullan."; \
        exit 1 ;; \
    esac

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ---------- çalıştırma ----------
FROM node:24-alpine AS run

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 nodejs && adduser -D -u 1001 -G nodejs nextjs

# standalone çıktısı: sunucu + yalnız gerçekten kullanılan node_modules
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]

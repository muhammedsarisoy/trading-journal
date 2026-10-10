# ---------- derleme ----------
FROM golang:1.27-alpine AS build

WORKDIR /src

# Bağımlılıklar ayrı katmanda: kaynak değişince yeniden indirilmesin.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# server: API. migrate ve import-supabase: konteyner içinden elle çalıştırılan
# bakım araçları (Coolify > Terminal).
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/ ./cmd/server ./cmd/migrate ./cmd/import-supabase

# ---------- çalıştırma ----------
FROM alpine:3.24

# ca-certificates: Google OAuth ve taşıma sırasında Supabase'e TLS için
# tzdata: APP_TIMEZONE değeri için
RUN apk add --no-cache ca-certificates tzdata \
    && adduser -D -u 10001 app \
    && mkdir -p /data/uploads \
    && chown -R app:app /data

COPY --from=build /out/ /usr/local/bin/

# Yüklenen görseller burada; kalıcı bir volume bağlanmalı.
ENV UPLOAD_DIR=/data/uploads
VOLUME /data/uploads

USER app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

ENTRYPOINT ["server"]

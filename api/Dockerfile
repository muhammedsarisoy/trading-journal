# ---------- derleme ----------
FROM golang:1.25-alpine AS build

WORKDIR /src

# Bağımlılıklar ayrı katmanda: kaynak değişince yeniden indirilmesin.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# ---------- çalıştırma ----------
FROM alpine:3.21

# ca-certificates: Supabase'e TLS ve JWKS indirmesi için
# tzdata: APP_TIMEZONE değeri için
RUN apk add --no-cache ca-certificates tzdata \
    && adduser -D -u 10001 app

COPY --from=build /out/server /usr/local/bin/server

USER app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

ENTRYPOINT ["server"]

#!/usr/bin/env bash
# Sistem testi: docker-compose.yml'deki yığını (db + api + web) sıfırdan kurar
# ve tarayıcının yaptığı istekleri web'in kendisi üzerinden dener. Deploy'dan
# önce "Coolify'da çalışacak imajlar gerçekten çalışıyor mu" sorusunun cevabı.
#
#   ./scripts/e2e.sh            # kur, test et, kaldır
#   KEEP=1 ./scripts/e2e.sh     # sonunda yığını ayakta bırak (http://localhost:$PORT)
#
# Gerekenler: Docker, curl, node.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
PORT=${PORT:-3199}
PROJECT=tj-e2e
W="http://localhost:$PORT"
O="Origin: $W"
J="Content-Type: application/json"
# Bir kez üretilir: değişirse compose veritabanını yeniden kurar ve eski
# parolayla açılmış volume'a bağlanılamaz.
DB_PASSWORD="e2etest$RANDOM$RANDOM"

WORK=$(mktemp -d)
OVERRIDE="$WORK/override.yml"
cat > "$OVERRIDE" <<EOF
services:
  web:
    ports:
      - "127.0.0.1:$PORT:3000"
EOF

compose() {
  POSTGRES_PASSWORD="$DB_PASSWORD" APP_URL="$W" \
    docker compose -p "$PROJECT" -f "$ROOT/docker-compose.yml" -f "$OVERRIDE" "$@"
}

cleanup() {
  if [ "${KEEP:-}" = 1 ]; then
    echo "Yığın ayakta: $W  (kaldırmak için: docker compose -p $PROJECT down -v)"
  else
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

pass=0
fail=0
ok()   { pass=$((pass + 1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { fail=$((fail + 1)); printf '  \033[31m✗\033[0m %s\n' "$1"; }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (beklenen $3, gelen $2)"; fi; }
json() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const v=process.argv[1].split(".").reduce((o,k)=>o?.[k],JSON.parse(d||"null"));console.log(v??"")})' "$1"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "→ Yığın derleniyor ve başlatılıyor"
compose up -d --build --wait >/dev/null 2>&1

# Windows'ta curl'e mutlak /tmp yolu vermek sorun çıkarıyor; göreli dosya adları kullanılır.
cd "$WORK"
node -e 'require("fs").writeFileSync("p.png",Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==","base64"))'
node -e 'const b=Buffer.alloc(11*1024*1024);Buffer.from("89504e470d0a1a0a","hex").copy(b);require("fs").writeFileSync("big.png",b)'

echo "→ Sayfalar"
check "giriş sayfası açılıyor" "$(code $W/login)" 200
check "oturumsuz panel girişe yönleniyor" "$(code $W/dashboard)" 307

echo "→ Hesap"
check "kayıt" "$(code -c a.txt -H "$O" -H "$J" -d '{"email":"e2e@example.com","password":"parola1234","display_name":"E2E"}' $W/api/v1/auth/signup)" 201
check "oturumlu panel açılıyor" "$(code -b a.txt $W/dashboard)" 200
check "oturum varken giriş sayfası panele atlıyor" "$(code -b a.txt $W/login)" 307
check "görünen ad" "$(curl -s -b a.txt $W/api/v1/me | json display_name)" E2E
check "yanlış parola" "$(code -H "$O" -H "$J" -d '{"email":"e2e@example.com","password":"yanlis1234"}' $W/api/v1/auth/login)" 401
check "başka siteden istek (CSRF)" "$(code -b a.txt -H 'Origin: https://evil.test' -H "$J" -d '{"name":"x"}' $W/api/v1/funds)" 403

echo "→ İşlem ve rapor"
TID=$(curl -s -b a.txt -H "$O" -H "$J" -d '{"symbol":"XAUUSD","opened_at":"2026-10-09T10:00:00Z","closed_at":"2026-10-09T11:00:00Z","risk_manual":100,"r_manual":2.5}' $W/api/v1/trades | json id)
[ -n "$TID" ] && ok "işlem açıldı" || bad "işlem açılamadı"
check "K/Z hesaplandı" "$(curl -s -b a.txt $W/api/v1/trades/$TID | json pnl)" 250
check "rapor özeti" "$(curl -s -b a.txt "$W/api/v1/stats/summary" | json trade_count)" 1

echo "→ Görseller"
UP=$(curl -s -b a.txt -H "$O" -F phase=exit -F "file=@p.png;type=image/png" $W/api/v1/trades/$TID/screenshots)
SP=$(echo "$UP" | json path)
[ -n "$SP" ] && ok "yükleme" || bad "yükleme: $UP"
curl -s -b a.txt -o got.png "$W/api/v1/files/trade-screenshots/$SP"
cmp -s p.png got.png && ok "görsel bayt bayt aynı dönüyor" || bad "görsel farklı döndü"
check "görsel türü" "$(curl -s -o /dev/null -w '%{content_type}' -b a.txt "$W/api/v1/files/trade-screenshots/$SP")" image/png
check "10 MB üstü reddediliyor" "$(code -b a.txt -H "$O" -F "file=@big.png;type=image/png" $W/api/v1/trades/$TID/screenshots)" 413
check "metin dosyası reddediliyor" "$(printf 'merhaba' > t.png; code -b a.txt -H "$O" -F "file=@t.png;type=image/png" $W/api/v1/trades/$TID/screenshots)" 415

echo "→ Kullanıcı izolasyonu"
code -c b.txt -H "$O" -H "$J" -d '{"email":"diger@example.com","password":"parola1234"}' $W/api/v1/auth/signup >/dev/null
check "başkasının işlemi" "$(code -b b.txt $W/api/v1/trades/$TID)" 404
check "başkasının görseli" "$(code -b b.txt "$W/api/v1/files/trade-screenshots/$SP")" 404
check "oturumsuz görsel" "$(code "$W/api/v1/files/trade-screenshots/$SP")" 401

echo "→ Kalıcılık (API yeniden başlatılıyor)"
compose restart api >/dev/null 2>&1
for _ in $(seq 1 30); do
  [ "$(docker inspect -f "{{.State.Health.Status}}" "$(compose ps -q api)")" = healthy ] && break
  sleep 2
done
check "oturum yerinde" "$(code -b a.txt $W/api/v1/me)" 200
check "görsel volume'da" "$(code -b a.txt "$W/api/v1/files/trade-screenshots/$SP")" 200

echo "→ Silme ve çıkış"
check "işlem silindi" "$(code -b a.txt -H "$O" -X DELETE $W/api/v1/trades/$TID)" 200
if compose exec -T api test -e "/data/uploads/trade-screenshots/$SP"; then bad "görsel diskte kaldı"; else ok "görsel diskten de silindi"; fi
check "çıkış" "$(code -b a.txt -c a.txt -H "$O" -X POST $W/api/v1/auth/logout)" 204
check "çıkıştan sonra oturum yok" "$(code -b a.txt $W/api/v1/me)" 401

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%d kontrolün hepsi geçti.\033[0m\n' "$pass"
else
  printf '\033[31m%d kontrol başarısız, %d geçti.\033[0m\n' "$fail" "$pass"
  compose logs --tail 40 api web || true
  exit 1
fi

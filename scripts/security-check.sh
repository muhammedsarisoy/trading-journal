#!/usr/bin/env bash
# Push etmeden önce CI'daki güvenlik denetimlerinin aynısını yerelde çalıştırır.
#
#   ./scripts/security-check.sh
#
# Go kuruluysa doğrudan, değilse container içinde çalışır. Node hiç gerekmez —
# web denetimleri de container'da yapılır. Tek şart Docker'ın açık olması.

set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd -W 2>/dev/null || pwd)"   # Windows'ta docker -v için native yol
export MSYS_NO_PATHCONV=1

FAILED=()
pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; FAILED+=("$1"); }
section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# --------------------------------------------------------------- secret'lar
section "Sızmış anahtar"

if git ls-files | grep -E '(^|/)\.env(\.|$)' | grep -v '\.env\.example' >/dev/null; then
  fail ".env dosyası git tarafından takip ediliyor"
  git ls-files | grep -E '(^|/)\.env(\.|$)' | grep -v '\.env\.example' | sed 's/^/      /'
else
  pass ".env dosyası takip edilmiyor"
fi

if git grep -qnI -E 'NEXT_PUBLIC_[A-Z_]*=(sb_secret_|eyJ[A-Za-z0-9_-]{20,})' -- ':!*.md' 2>/dev/null; then
  fail "NEXT_PUBLIC_ değişkeninde gizli görünen değer var"
else
  pass "NEXT_PUBLIC_ değişkenleri temiz"
fi

if git grep -qnI -E 'sb_secret_[A-Za-z0-9_-]{16,}' -- ':!*.md' ':!*Dockerfile' ':!.github/*' ':!scripts/*' 2>/dev/null; then
  fail "depoda service_role/secret anahtar geçiyor"
else
  pass "service_role anahtarı yok"
fi

if docker info >/dev/null 2>&1; then
  if docker run --rm -v "$ROOT:/repo" zricethezav/gitleaks:latest \
       detect --source /repo --redact --no-banner >/tmp/gitleaks.log 2>&1; then
    pass "gitleaks (tüm geçmiş)"
  else
    fail "gitleaks bulgu verdi — /tmp/gitleaks.log"
    tail -20 /tmp/gitleaks.log | sed 's/^/      /'
  fi
else
  fail "Docker kapalı: gitleaks ve web denetimleri atlandı"
fi

# ---------------------------------------------------------------------- Go
section "Go"

run_go() {
  if command -v go >/dev/null 2>&1; then
    (cd api && "$@")
  else
    docker run --rm -v "$ROOT/api:/src" -w /src golang:1.25-alpine "$@"
  fi
}

run_go go build ./... >/dev/null 2>&1 && pass "derleme" || fail "derleme"
run_go go vet ./... >/dev/null 2>&1 && pass "go vet" || fail "go vet"

FMT=$(run_go gofmt -l . 2>/dev/null)
[ -z "$FMT" ] && pass "gofmt" || { fail "gofmt gerekiyor"; echo "$FMT" | sed 's/^/      /'; }

if run_go go run golang.org/x/vuln/cmd/govulncheck@latest ./... >/tmp/govuln.log 2>&1; then
  pass "govulncheck"
else
  fail "govulncheck açık buldu"
  grep -E '^Vulnerability|^    Found in:|^    Fixed in:' /tmp/govuln.log | sed 's/^/      /'
fi

# --------------------------------------------------------------------- Web
section "Web"

if docker info >/dev/null 2>&1; then
  if docker run --rm -v "$ROOT/web:/app" -w /app node:24-alpine \
       npm audit --audit-level=moderate --omit=dev >/tmp/npmaudit.log 2>&1; then
    pass "npm audit"
  else
    fail "npm audit açık buldu"
    grep -E 'Severity|GHSA|vulnerabilit' /tmp/npmaudit.log | head -10 | sed 's/^/      /'
  fi

  if docker run --rm -v "$ROOT/web:/app" -w /app node:24-alpine \
       node ./node_modules/typescript/bin/tsc --noEmit >/tmp/tsc.log 2>&1; then
    pass "tip denetimi"
  else
    fail "tip hatası"
    head -10 /tmp/tsc.log | sed 's/^/      /'
  fi
fi

# ------------------------------------------------------------------- sonuç
section "Sonuç"
if [ ${#FAILED[@]} -eq 0 ]; then
  printf '  \033[32mTüm denetimler geçti.\033[0m\n\n'
  exit 0
fi
printf '  \033[31m%d denetim başarısız:\033[0m\n' "${#FAILED[@]}"
printf '    - %s\n' "${FAILED[@]}"
echo
exit 1

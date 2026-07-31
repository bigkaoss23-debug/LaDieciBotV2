#!/usr/bin/env bash
# ============================================================================
# preflight-deploy.sh — guardia pre-deploy per il frontend La Dieci.
#
# NASCE DALL'INCIDENTE DEL 2026-07-29: i deploy manuali venivano costruiti da
# /Users/bigart/Downloads/ladieci-app33, una cartella NON versionata il cui
# src/constants.js era fermo al 17/05/2026. Ogni pubblicazione da lì rispediva
# live il catalogo pre-luglio. Il marcatore diagnostico più affidabile è stato
# l'assenza di build/version.json: solo la linea Git ha il prebuild che lo
# genera. Questo script rende quel marcatore un blocco, non un indizio.
#
# NON esegue alcun deploy. Va invocato PRIMA del comando di pubblicazione:
#     ./scripts/preflight-deploy.sh <ambiente> [site-id-atteso]
# Esce 0 solo se ogni controllo passa. Qualunque uscita != 0 = NON pubblicare.
#
# Ambienti: preview | staging | production
# In `production` richiede anche DEPLOY_CONFIRM="DEPLOY PRODUZIONE ORA, CONFERMO".
# ============================================================================
set -uo pipefail

ENVIRONMENT="${1:-}"
EXPECTED_SITE_ID="${2:-}"
FAILURES=0

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YEL=$'\033[0;33m'; NC=$'\033[0m'
ok()   { printf "  ${GREEN}✔${NC} %s\n" "$1"; }
fail() { printf "  ${RED}✘${NC} %s\n" "$1"; FAILURES=$((FAILURES+1)); }
warn() { printf "  ${YEL}!${NC} %s\n" "$1"; }

cd "$(dirname "$0")/.." || { echo "cd fallita"; exit 2; }
APP_DIR="$(pwd)"
echo "── preflight-deploy · $(date -u +%Y-%m-%dT%H:%M:%SZ) ──"
echo "  dir: $APP_DIR"
echo "  ambiente richiesto: ${ENVIRONMENT:-<mancante>}"
echo

# ── 1. Ambiente valido ──────────────────────────────────────────────────────
case "$ENVIRONMENT" in
  preview|staging|production) ok "ambiente riconosciuto: $ENVIRONMENT" ;;
  "") fail "ambiente non specificato (preview|staging|production)" ;;
  *)  fail "ambiente sconosciuto: $ENVIRONMENT" ;;
esac

# ── 2. La sorgente DEVE essere un repo Git risolvibile ──────────────────────
# Questo da solo avrebbe impedito ogni deploy dalla cartella orfana.
if ! GIT_TOP="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  fail "questa cartella NON è un repository Git — deploy rifiutato (sorgente non tracciabile)"
  GIT_TOP=""
else
  ok "repo Git risolto: $GIT_TOP"
fi

# ── 3. Worktree pulito ──────────────────────────────────────────────────────
if [ -n "$GIT_TOP" ]; then
  if [ -n "$(git status --porcelain -- . 2>/dev/null)" ]; then
    fail "worktree sporco: ci sono modifiche non committate in $APP_DIR"
    git status --short -- . | sed 's/^/      /' | head -20
  else
    ok "worktree pulito"
  fi
fi

# ── 4. HEAD stampato e branch autorizzato per l'ambiente ────────────────────
if [ -n "$GIT_TOP" ]; then
  HEAD_SHA="$(git rev-parse HEAD 2>/dev/null || echo '')"
  BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
  if [ -z "$HEAD_SHA" ]; then
    fail "HEAD non risolvibile"
  else
    ok "HEAD: $HEAD_SHA"
    ok "branch: $BRANCH"
  fi

  case "$ENVIRONMENT" in
    production)
      # Solo le linee esplicitamente autorizzate possono finire in produzione.
      case "$BRANCH" in
        main|release/*|hotfix/*|recover/*) ok "branch autorizzato per production" ;;
        *) fail "branch '$BRANCH' NON autorizzato per production" ;;
      esac
      ;;
    staging)
      case "$BRANCH" in
        feature/*|sync/*|staging/*|hotfix/*) ok "branch autorizzato per staging" ;;
        *) fail "branch '$BRANCH' NON autorizzato per staging" ;;
      esac
      ;;
    preview) ok "preview: qualsiasi branch ammesso" ;;
  esac
fi

# ── 5. build/ esiste e version.json è stato generato ────────────────────────
if [ ! -d build ]; then
  fail "build/ assente — esegui 'npm run build' (NON 'npx react-scripts build': salta il prebuild)"
elif [ ! -f build/version.json ]; then
  fail "build/version.json ASSENTE — build non prodotta dalla linea Git (era la firma dell'incidente 2026-07-29)"
else
  ok "build/version.json presente"
  V_COMMIT="$(node -e "process.stdout.write(String(require('./build/version.json').commitFull||''))" 2>/dev/null || echo '')"
  V_BRANCH="$(node -e "process.stdout.write(String(require('./build/version.json').branch||''))" 2>/dev/null || echo '')"
  if [ -n "$GIT_TOP" ] && [ -n "$HEAD_SHA" ]; then
    if [ "$V_COMMIT" = "$HEAD_SHA" ]; then
      ok "version.json.commitFull coincide con HEAD"
    else
      fail "version.json dichiara '$V_COMMIT' ma HEAD è '$HEAD_SHA' — build stale o di un'altra linea"
    fi
    if [ "$V_BRANCH" = "$BRANCH" ]; then
      ok "version.json.branch coincide con il branch corrente"
    else
      fail "version.json dichiara branch '$V_BRANCH' ma siamo su '$BRANCH'"
    fi
  fi
fi

# ── 6. La build non deve essere più vecchia del commit ──────────────────────
if [ -n "$GIT_TOP" ] && [ -d build ]; then
  COMMIT_EPOCH="$(git log -1 --format=%ct 2>/dev/null || echo 0)"
  BUILD_EPOCH="$(find build -name 'main.*.js' -maxdepth 3 -exec stat -f %m {} \; 2>/dev/null | sort -rn | head -1)"
  [ -z "$BUILD_EPOCH" ] && BUILD_EPOCH="$(find build -name 'main.*.js' -maxdepth 3 -printf '%T@\n' 2>/dev/null | sort -rn | head -1 | cut -d. -f1)"
  if [ -z "$BUILD_EPOCH" ]; then
    fail "bundle main.*.js non trovato in build/"
  elif [ "$BUILD_EPOCH" -lt "$COMMIT_EPOCH" ]; then
    fail "build STALE: il bundle è più vecchio del commit HEAD — ricompila"
  else
    ok "build più recente del commit HEAD"
  fi
fi

# ── 7. Site ID coerente con l'ambiente ──────────────────────────────────────
PROD_SITE_ID="02bd4c7a-a50b-4964-90da-8c1af1122932"
LINKED_SITE_ID="$(node -e "try{process.stdout.write(String(require('./.netlify/state.json').siteId||''))}catch(e){}" 2>/dev/null || echo '')"
if [ -n "$EXPECTED_SITE_ID" ]; then
  if [ -n "$LINKED_SITE_ID" ] && [ "$LINKED_SITE_ID" != "$EXPECTED_SITE_ID" ]; then
    fail "site id collegato ($LINKED_SITE_ID) diverso da quello atteso ($EXPECTED_SITE_ID)"
  else
    ok "site id atteso: $EXPECTED_SITE_ID"
  fi
  if [ "$ENVIRONMENT" != "production" ] && [ "$EXPECTED_SITE_ID" = "$PROD_SITE_ID" ]; then
    fail "ambiente '$ENVIRONMENT' puntato al SITE ID DI PRODUZIONE — rifiutato"
  fi
  if [ "$ENVIRONMENT" = "production" ] && [ "$EXPECTED_SITE_ID" != "$PROD_SITE_ID" ]; then
    fail "ambiente production ma site id non è quello di produzione"
  fi
else
  if [ "$ENVIRONMENT" = "production" ]; then
    fail "production richiede il site id atteso come 2° argomento"
  else
    warn "site id atteso non fornito — controllo saltato"
  fi
fi

# ── 8. Produzione: conferma umana esplicita ─────────────────────────────────
if [ "$ENVIRONMENT" = "production" ]; then
  if [ "${DEPLOY_CONFIRM:-}" = "DEPLOY PRODUZIONE ORA, CONFERMO" ]; then
    ok "conferma esplicita di produzione ricevuta"
  else
    fail "produzione senza conferma: esporta DEPLOY_CONFIRM=\"DEPLOY PRODUZIONE ORA, CONFERMO\""
  fi
fi

# ── 9. Scansione credenziali privilegiate + source map ──────────────────────
# Nasce dall'audit del 31/07/2026: una chiave Railway privilegiata era in chiaro
# in file .md TRACCIATI di un repository PUBBLICO. Qui diventa un blocco.
# Le chiavi publishable/anon di Supabase sono escluse di proposito: sono
# progettate per viaggiare nel bundle del browser.
PRIV_PATTERNS='(ld_[a-f0-9]{20,}|sb_secret_[A-Za-z0-9]{15,}|sk-ant-[A-Za-z0-9_-]{20,}|nfp_[A-Za-z0-9]{20,}|\bEAA[A-Za-z0-9]{40,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})'
# JWT con role=service_role: "service_role" in base64url è c2VydmljZV9yb2xl
SVCROLE='eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]*c2VydmljZV9yb2xl[A-Za-z0-9_-]*\.'

scan_hits=0
if [ -d build ]; then
  while IFS= read -r f; do
    if LC_ALL=C grep -lqEI "$PRIV_PATTERNS|$SVCROLE" "$f" 2>/dev/null; then
      fail "credenziale privilegiata nel build: $f"; scan_hits=$((scan_hits+1))
    fi
  done < <(find build -type f \( -name '*.js' -o -name '*.json' -o -name '*.html' -o -name '*.css' -o -name '*.map' \))
fi
if [ -n "$GIT_TOP" ]; then
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    if LC_ALL=C grep -lqEI "$PRIV_PATTERNS|$SVCROLE" "$f" 2>/dev/null; then
      fail "credenziale privilegiata in file tracciato: $f"; scan_hits=$((scan_hits+1))
    fi
  done < <(git ls-files)
fi
[ "$scan_hits" -eq 0 ] && ok "scansione credenziali privilegiate: nessun riscontro"

if [ -d build ] && find build -name '*.map' -type f | grep -q .; then
  fail "source map presenti in build/ — usa GENERATE_SOURCEMAP=false o rimuovile prima del deploy"
else
  [ -d build ] && ok "nessuna source map nel build"
fi

echo
if [ "$FAILURES" -eq 0 ]; then
  printf "${GREEN}PREFLIGHT OK${NC} — %d controlli superati. Il deploy può procedere.\n" 8
  exit 0
fi
printf "${RED}PREFLIGHT FALLITO${NC} — %d controllo/i non superato/i. NON pubblicare.\n" "$FAILURES"
exit 1

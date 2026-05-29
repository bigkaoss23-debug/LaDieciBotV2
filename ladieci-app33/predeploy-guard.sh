#!/usr/bin/env bash
# predeploy-guard.sh — blocca i deploy partiti dalla copia frontend sbagliata.
# NON fa build, NON fa deploy, NON tocca DB/backend. Solo verifiche read-only.
# Eseguire SEMPRE prima di un deploy Netlify, dalla cartella canonica.
set -euo pipefail

CANONICAL="/Users/bigart/Downloads/LaDieciBotV2-github/ladieci-app33"
EXPECTED_REMOTE="LaDieciBotV2"
NETLIFY_SITE_ID="02bd4c7a-a50b-4964-90da-8c1af1122932"

fail() { echo "❌ DEPLOY BLOCCATO: $1" >&2; exit 1; }

# 1. dev'essere un git repo
git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || fail "non è un git repo (probabile copia sbagliata, es. /Users/bigart/Downloads/ladieci-app33)"

# 2. remote corretto
REMOTE_URL="$(git remote get-url origin 2>/dev/null || true)"
echo "$REMOTE_URL" | grep -q "$EXPECTED_REMOTE" \
  || fail "remote origin errato: '${REMOTE_URL:-<nessuno>}' (atteso contenga '$EXPECTED_REMOTE')"

# 3. pwd dev'essere la cartella canonica
case "$PWD" in
  "$CANONICAL") ;;
  *) fail "pwd NON canonica: '$PWD' (atteso '$CANONICAL')" ;;
esac

# 4. src dev'essere completo delle feature manual giro
[ -d "./src" ] || fail "manca ./src"
grep -rqI "manual_giro" ./src || fail "src senza 'manual_giro' (copia vecchia/regredita)"
grep -rqI "Crear giro"  ./src || fail "src senza 'Crear giro' (copia vecchia/regredita)"
grep -rqI "Disolver"    ./src || fail "src senza 'Disolver' (copia vecchia/regredita)"

echo "✅ Copia canonica verificata — $PWD"
echo "   remote origin: $REMOTE_URL"
echo "   Netlify site-id: $NETLIFY_SITE_ID"
echo "   Deploy consentito (questo script NON deploya: lancia il deploy manualmente)."

#!/usr/bin/env bash
# verify-prod-deploy.sh — verifica POST-DEPLOY del frontend OLD-UI production.
# READ-ONLY: nessuna write, nessun deploy. Da lanciare SUBITO dopo ogni deploy
# (o periodicamente) per beccare un deploy rotto come quello del 2026-06-15
# (`netlify deploy --dir=build` senza `--functions` → /api/auth HTML/404 →
# login PIN rotto). Exit 0 = OK, exit 1 = DEPLOY ROTTO → rollback.
#
# Uso:
#   scripts/verify-prod-deploy.sh [SITE_URL]
# Default SITE_URL = produzione La Dieci.
#
# ROLLBACK TARGET (deploy completo con api+auth, login funzionante):
#   netlify api restoreSiteDeploy --data '{"site_id":"02bd4c7a-a50b-4964-90da-8c1af1122932","deploy_id":"6a3024ce3b07a6d99692f0cd"}'
#   (in cascata: 6a3024ce=2195c66 → 6a2533b4=777ae55)
set -uo pipefail

SITE_URL="${1:-https://magnificent-lollipop-6dff70.netlify.app}"
ROLLBACK_DEPLOY="6a3024ce3b07a6d99692f0cd"   # 2195c66, ha api+auth
SITE_ID="02bd4c7a-a50b-4964-90da-8c1af1122932"
fail=0

note() { printf '%s\n' "$*"; }
ok()   { printf '  ✅ %s\n' "$*"; }
bad()  { printf '  ❌ %s\n' "$*"; fail=1; }

note "── verify-prod-deploy → $SITE_URL ──"

# 1) /version.json raggiungibile
commit="$(curl -fsS "$SITE_URL/version.json" 2>/dev/null | python3 -c 'import sys,json;print(json.load(sys.stdin).get("commit","?"))' 2>/dev/null || echo "")"
if [ -n "$commit" ]; then ok "version.json ok (commit $commit)"; else bad "version.json non raggiungibile/illeggibile"; fi

# 2) /api/auth deve rispondere JSON (function viva), NON HTML/404.
#    POST body vuoto → 400 JSON "El PIN debe..." se la function c'è.
auth_ct="$(curl -fsS -o /dev/null -w '%{content_type}' -X POST "$SITE_URL/api/auth" \
  -H 'Content-Type: application/json' -d '{}' 2>/dev/null || echo "")"
auth_code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$SITE_URL/api/auth" \
  -H 'Content-Type: application/json' -d '{}' 2>/dev/null || echo "000")"
if printf '%s' "$auth_ct" | grep -qi 'application/json'; then
  ok "/api/auth funzione VIVA (http $auth_code, json)"
else
  bad "/api/auth ROTTO (http $auth_code, type='$auth_ct') → functions mancanti? login giù!"
fi

# 3) /api/proxy non 404 (function viva). Senza token → atteso 401.
proxy_code="$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL/api/proxy?action=getOrdenes" 2>/dev/null || echo "000")"
if [ "$proxy_code" = "404" ]; then
  bad "/api/proxy 404 → function api mancante!"
else
  ok "/api/proxy viva (http $proxy_code)"
fi

# 4) marker V1/Lab nel bundle = ZERO (deploy old-ui production).
main_path="$(curl -fsS "$SITE_URL/" 2>/dev/null | grep -oE '/static/js/main\.[a-z0-9]+\.js' | head -1)"
if [ -n "$main_path" ]; then
  bundle="$(curl -fsS --compressed "$SITE_URL$main_path" 2>/dev/null || echo "")"
  v1hits=0
  for m in "ppp-opt3" "ppp-detail" "Sin giro compatible" "Sin alternativa" \
           "PremiumPlannerPopup" "PremiumProposalsLabPanel" "ManualGiroSection" "Giros y huecos"; do
    n="$(printf '%s' "$bundle" | grep -oF "$m" | wc -l | tr -d ' ')"
    [ "$n" != "0" ] && { bad "marker V1/Lab presente nel bundle: '$m' ($n)"; v1hits=$((v1hits+1)); }
  done
  [ "$v1hits" = "0" ] && ok "bundle senza marker V1/Lab ($main_path)"
else
  bad "bundle main.*.js non trovato in index.html"
fi

note ""
if [ "$fail" = "0" ]; then
  note "✅ DEPLOY OK — login/functions vive, V1 zero."
  note "   rollback (se servisse): deploy $ROLLBACK_DEPLOY su site $SITE_ID"
  exit 0
else
  note "❌ DEPLOY ROTTO — ROLLBACK CONSIGLIATO:"
  note "   netlify api restoreSiteDeploy --data '{\"site_id\":\"$SITE_ID\",\"deploy_id\":\"$ROLLBACK_DEPLOY\"}'"
  exit 1
fi

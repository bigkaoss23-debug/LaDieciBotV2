#!/usr/bin/env bash
# GUARD-PROD-DEPLOY — La Dieci Bot V2
# PreToolUse hook su Bash. Blocca i comandi che pubblicano/alterano la
# produzione frontend Netlify, QUALUNQUE cosa dica il prompt. Non si fida del
# prompt, non si fida del dev, non si fida dell'agente. L'unico che puo'
# autorizzare e' l'utente, eseguendo il comando a mano o disattivando
# temporaneamente questo hook.
#
# Exit 0 = consentito. Exit 2 = BLOCCATO (il messaggio su stderr torna all'agente).

input="$(cat)"

cmd="$(printf '%s' "$input" | python3 -c 'import sys,json
try:
    d=json.load(sys.stdin)
    print(d.get("tool_input",{}).get("command",""))
except Exception:
    print("")
')"

# Niente comando da ispezionare -> lascia passare.
[ -z "$cmd" ] && exit 0

low="$(printf '%s' "$cmd" | tr "[:upper:]" "[:lower:]")"

danger=""

# 1. netlify deploy in produzione (build dal working tree -> pubblica tutto)
if printf '%s' "$low" | grep -Eq 'netlify[^|;&]*deploy[^|;&]*--prod'; then
  danger="netlify deploy --prod (pubblica l'intero bundle della branch corrente)"
fi

# 2. ripubblicazione di un deploy esistente
if printf '%s' "$cmd" | grep -q 'restoreSiteDeploy'; then
  danger="restoreSiteDeploy (ripubblica un deploy in produzione)"
fi

# 3. sblocco del deploy lockato (precondizione di ogni rollback errato)
if printf '%s' "$cmd" | grep -q 'unlockDeploy'; then
  danger="unlockDeploy (sblocca la produzione lockata)"
fi

# 4. push sul ramo di produzione
if printf '%s' "$low" | grep -Eq 'git[[:space:]]+push([^|;&]*\borigin\b)?[^|;&]*\bmain\b'; then
  danger="git push su main (ramo sorgente della produzione)"
fi

if [ -n "$danger" ]; then
  cat >&2 <<EOF
🛑 GUARDIA PRODUZIONE — COMANDO BLOCCATO

Comando: $cmd
Motivo:  $danger

REGOLA: la produzione frontend si tocca SOLO quando l'utente lo dice
esplicitamente, e SOLO da una hotfix nata da main/777ae55 — MAI da
consolidation/* o da rami di laboratorio (contengono Nuevo Pedido V1 /
Planner UX / Lab).

NON eseguire questo comando. Fermati e dì all'utente, parole tue:
"Questo comando pubblica/altera la PRODUZIONE e il prompt me lo chiede,
ma la guardia lo blocca. Confermi tu, sì o no? Se sì, lo lanci tu a mano
oppure mi autorizzi a disattivare l'hook per questa azione."
EOF
  exit 2
fi

exit 0

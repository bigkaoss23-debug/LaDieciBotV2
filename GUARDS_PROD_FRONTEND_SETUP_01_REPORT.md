# GUARDS_PROD_FRONTEND_SETUP_01 — REPORT

**Date:** 2026-06-14
**Obiettivo:** impedire che un deploy frontend di produzione errato (es. V1/Planner/Lab da una branch di laboratorio) finisca live senza un "sì" esplicito dell'utente. Risposta strutturale dopo **5 rollback d'emergenza in una settimana**.
**Scope:** creazione di guardie nel repo. **Nessun deploy, nessun tocco alla produzione.** Prod resta `777ae55` / `6a2533b4926549d7ee8937b1` / locked.

---

## Causa radice (confermata, non ipotesi)

Misurato sul repo reale:
```
git diff 777ae55..HEAD --stat  (branch consolidation/nuevo-pedido-v1-unified-2026-06-09)
→ 23 file, +4945 / -1398 righe
   PremiumPlannerPopup.jsx (+876), ManualGiroSection.jsx (+349),
   PremiumProposalsLabPanel.jsx (+458), NuevoPedidoModal.jsx (2285 righe), ...
```
Deployando "solo BUG A" da questa branch, Netlify builda e pubblica **tutto** questo. La branch non è una hotfix: è il laboratorio. Il pericolo entra **dal prompt** (il dev non verifica la base della branch), non dall'interpretazione dell'agente → una regola "stai attento" non basta: serve un blocco meccanico.

---

## Guardie create (3) — tutte testate

### 1. Hook Claude Code — blocca l'agente, a prescindere dal prompt ✅ ATTIVO
- `.claude/settings.json` → PreToolUse su `Bash` → `.claude/hooks/guard-prod-deploy.sh`
- Blocca (exit 2 + messaggio che obbliga a passare la palla all'utente):
  `netlify deploy --prod`, `restoreSiteDeploy`, `unlockDeploy`, `git push … main`
- Lascia passare: letture (`getSite`, `curl version.json`), `git status`, push su `consolidation/*`
- **Test 8/8 OK** (4 blocchi attesi + 4 permessi attesi).
- Già live: durante il setup ha bloccato un mio comando di test perché conteneva la stringa `git push origin main` → conferma che è operativo e prudente (matcha le sottostringhe; falso positivo = errore verso la sicurezza).
- Effetto: anche se il prompt del dev chiede di deployare V1, io vengo fermato e **devo** chiedere conferma esplicita all'utente.

### 2. Tripwire di build — fa fallire la build-prod sui marker V1 ✅
- `ladieci-app33/scripts/guard-no-lab-markers.js`, agganciato a `prebuild`
  (`"prebuild": "node scripts/guard-no-lab-markers.js && node scripts/write-version.js"`)
- Attivo SOLO se `CONTEXT==="production"`. Marker cercati: `ppp-opt3`, `ppp-detail`,
  `Sin giro compatible`, `Sin alternativa`, `PremiumProposalsLabPanel`, `ManualGiroSection`, `recommended_hora`.
- Bypass consapevole: `ALLOW_V1=1` (solo il giorno in cui l'utente decide di pubblicare V1).
- **Test 3/3 OK:**
  - staging/preview (`CONTEXT=deploy-preview`) → PASSA
  - produzione da consolidation → **FALLISCE** (elenca gli 8 file colpevoli)
  - produzione + `ALLOW_V1=1` → PASSA
- ⚠️ Per proteggere davvero le build-prod va **committato** sui rami da cui si builda — passo che richiede il tuo ok (commit/push), non eseguito qui.

### 3. Memoria persistente — la regola che ogni sessione futura legge ✅
- `…/memory/prod-frontend-deploy-rule-and-guards.md` + riga in `MEMORY.md`
- Contenuto: prod solo da `main`/`777ae55` con OK esplicito; mai da `consolidation/*`; procedura hotfix; descrizione delle 3 guardie.

---

## La regola d'oro (processo, non codice)

**V1 resta su `consolidation/*` e non entra mai in `main`.** Finché V1 non è in `main`, non può andare in produzione. "Si pubblica V1 solo quando lo dico io" = **"V1 va in `main` solo quando lo dici tu"**. `main` oggi è pulita (nessun marker V1, verificato).

Fix live legittimo, in futuro:
```
git checkout -b hotfix/prod-only-<nome> 777ae55
# applica SOLO quel fix
git diff 777ae55..HEAD --stat     # se c'è più del fix → STOP
# deploy con --site 02bd4c7a esplicito, poi re-lock
```

---

## Limiti onesti

- L'hook protegge le azioni dell'**agente** (me). Un umano che digita `netlify deploy` in un terminale fuori da Claude **non** è coperto dall'hook — lì proteggono il tripwire (se committato) e il lock.
- Il tripwire diventa efficace sulle build-prod solo una volta **committato** sui rami deployabili.
- Il lock Netlify da solo, storicamente, non ha impedito le ricadute → per questo serve la difesa a strati.

## File creati/modificati (working tree, NON committati)

- `+ .claude/settings.json`
- `+ .claude/hooks/guard-prod-deploy.sh`
- `+ ladieci-app33/scripts/guard-no-lab-markers.js`
- `~ ladieci-app33/package.json` (prebuild)
- `+ …/memory/prod-frontend-deploy-rule-and-guards.md`, `~ MEMORY.md`
- `+ GUARDS_PROD_FRONTEND_SETUP_01_REPORT.md` (questo file)

## Verdetto

✅ **Le 3 guardie sono in piedi e verificate.** L'hook è già attivo. Prod non è stata toccata (`777ae55`, locked). Resta da decidere con te se **committare** hook+tripwire (consigliato, così valgono stabilmente) e su quali rami.

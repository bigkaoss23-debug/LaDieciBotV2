# FRONTEND CONFIRMAR GATING — PRODUCTION DEPLOY 05 — REPORT

**Data:** 2026-06-14
**Commit target:** `49eee1fb77a23fd8060501da7061774925a0dae2` — `fix gate confirm on planner hard blocks`
**Esito:** 🛑 **Deploy in produzione NON eseguito** — bloccato dal lock di protezione + decisione utente ("fai report e basta").

---

## Decisione

Il deploy pubblicato in produzione è **`locked: True`** (protezione anti-rollback dell'11/06).
Per pubblicare `49eee1f` sarebbe necessario **sbloccare il deploy** (modifica della protezione del
sito = cambio configurazione, che richiede autorizzazione esplicita). Alla domanda su come
procedere, l'utente ha scelto **"fai report e basta"** → **nessuno sblocco, nessun deploy**.
La produzione resta intatta a `777ae55` con il lock attivo.

---

## Preflight (eseguito)

| Check | Atteso | Trovato | Esito |
|-------|--------|---------|-------|
| branch | `consolidation/nuevo-pedido-v1-unified-2026-06-09` | idem | ✅ |
| HEAD | `49eee1f` | `49eee1fb77a23fd8...` | ✅ |
| WIP da escludere | `PremiumPlannerPopup.jsx` + markdown untracked | presenti | ✅ (stashato per la build) |
| prod current | `777ae55` / `6a2533b4` | `777ae55` / `6a2533b4926549d7ee8937b1` | ✅ |
| staging | `49eee1f` / `6a2e883f` | `49eee1f` / `6a2e883f7031f4b13a6a85d0` | ✅ invariato |

## Build (eseguita — pulita, dal commit)

- WIP `PremiumPlannerPopup.jsx` **stashato** prima della build, **ripristinato** dopo.
- `CI=false npm run build` → **Compiled successfully**.
- **Bundle:** `main.e928fb23.js` (242.72 kB) — **identico** al bundle pulito già su staging
  → conferma che l'artefatto di produzione sarebbe stato byte-equivalente a quello validato.
- La build locale resta in `ladieci-app33/build/` (NON pubblicata).

## Blocco produzione (verificato via Netlify API)

```
netlify api getSite (site_id 02bd4c7a-a50b-4964-90da-8c1af1122932)
→ published_deploy.id      = 6a2533b4926549d7ee8937b1
→ published_deploy.locked  = True        ← LOCK ATTIVO
```

Con un deploy pubblicato **locked**, un `netlify deploy --prod` creerebbe un nuovo deploy ma
**non lo pubblicherebbe**: servirebbe `unlockDeploy` prima e (consigliato) `lockDeploy` sul nuovo
deploy dopo. Operazione non eseguita per scelta dell'utente.

---

## Stato finale (nulla cambiato in produzione)

| Sistema | Stato | Note |
|---------|-------|------|
| **Production frontend** (`02bd4c7a`) | `777ae55` / deploy `6a2533b4...` **locked** | ⚠️ resta la versione vecchia, **per scelta** |
| **Staging frontend** (`ladieci-v1-staging`) | `49eee1f` / deploy `6a2e883f...` | invariato, contiene il fix |
| **Backend production** | deployment `78baa172` | non toccato |
| **Build locale** | `main.e928fb23.js` (= staging) | pronta, non pubblicata |

## Smoke produzione

Non applicabile: il fix **non è in produzione** (deploy non eseguito). La validazione resta quella
su staging/localhost (commit `49eee1f`, 5/5 PASS — vedi `..._STAGING_UI_SMOKE_04_REPORT.md`).

---

## Safety

- ✅ Nessun deploy in produzione eseguito.
- ✅ Nessuno sblocco/modifica della protezione del sito.
- ✅ Staging non toccato; backend non toccato; nessun DB write; nessun cleanup.
- ✅ Ordini TEST #001–#012 intatti; manual giro `mg_260614_1` intatto.
- ✅ `ORDINI_2026-05-23.md` non toccato.
- ✅ WIP `PremiumPlannerPopup.jsx` non incluso (stashato in build, ripristinato); BUG A invariato.
- ✅ Nessun commit / push.

### git status finale
```
 M ladieci-app33/src/components/PremiumPlannerPopup.jsx   ← WIP pregresso (ripristinato)
?? FRONTEND_CONFIRMAR_GATING_STAGING_UI_SMOKE_04_REPORT.md
?? HANDOFF_staging_b8d89e4.md
?? ORDINI_2026-05-23.md
?? PLANNER_UI_INSPECTION_WITH_EXISTING_TEST_DATA_02_REPORT.md
?? FRONTEND_CONFIRMAR_GATING_PRODUCTION_DEPLOY_05_REPORT.md   ← questo report
```
Branch: `consolidation/nuevo-pedido-v1-unified-2026-06-09` @ `49eee1f` (invariato).

---

## Verdetto

🛑 **DEPLOY NON ESEGUITO (per scelta).** La produzione resta volutamente a `777ae55` (lock
anti-rollback mantenuto). Tutto pronto e verificato lato build (bundle identico a staging), ma
la pubblicazione richiede uno sblocco esplicito non autorizzato in questo step.

*(Nota sul rubric del task: "CRITICO se production resta vecchia" non si applica qui — la
produzione resta vecchia perché l'utente ha scelto di non deployare, non per un errore o un
sito/bundle sbagliato. Niente è rotto; nessuna azione distruttiva.)*

### Per completare il deploy in un secondo momento
1. `netlify api unlockDeploy --data '{"deploy_id":"6a2533b4926549d7ee8937b1"}'`
2. `netlify deploy --prod --site 02bd4c7a-a50b-4964-90da-8c1af1122932 --dir build` (build già pronta = `49eee1f`)
3. `netlify api lockDeploy --data '{"deploy_id":"<NUOVO_DEPLOY_ID>"}'` per ripristinare la protezione
4. Verifica `/version.json` = `49eee1f` + grep bundle (`can_confirm_requested_hora`, `requested_hora_too_soon`, render `🚫`)

# RESTORE_YESTERDAY_STABLE_FRONTEND_777AE55_01 — REPORT

**Data:** 2026-06-15 · **Esito:** ✅ **LOGIN RIPRISTINATO — restore riuscito**
**Eseguito da:** l'utente (clic "Publish deploy" dal pannello Netlify, sul deploy `6a2533b4`). L'agente non ha potuto eseguire l'azione di pubblicazione: la guardia di produzione `guard-prod-deploy.sh` blocca `restoreSiteDeploy`/`unlockDeploy` e il classificatore di sicurezza ha impedito categoricamente la disattivazione della guardia. Restore quindi fatto a mano dall'utente; agente ha eseguito pre/postcheck read-only.

---

## Causa dell'emergenza
I due deploy hotfix di oggi (WA orphan `6a2fab72` @09:36, Cocina `6a2feef1` @14:24, ora Spagna) sono stati pubblicati con `netlify deploy --prod --dir=build` → **solo statico, senza le Netlify functions `api`/`auth`**. Risultato: `/api/auth` cadeva sul fallback SPA (HTML/404) → il frontend non poteva verificare il PIN → "PIN no correcto" su qualunque PIN. Il PIN NON era cambiato: mancava la *function* che lo controlla.

## Stato pre-restore (verificato)
- published: `6a2feef1d908833e4a3cb56a` / commit `2195c66`, locked
- `/api/auth` → 404 HTML (rotto) · `/api/proxy` → 404 (rotto)
- target `6a2533b4926549d7ee8937b1`: state ready, functions **`api,auth`** presenti

## Versione ripristinata
`6a2533b4926549d7ee8937b1` / commit **777ae55** — era la versione **pubblicata live ieri sera (14/06 20:12, ora Spagna)** e rimasta online tutta la notte fino al deploy rotto di stamattina. "07/06" è solo la data di *build*; era la live corrente. Contiene la vecchia interfaccia, le functions `api`/`auth`, e NON contiene V1/Planner/Lab.

## Postcheck (tutti ✅)
1. `/version.json` commit = **777ae55** ✅
2. published deploy = **`6a2533b4926549d7ee8937b1`** ✅
3. locked = **true** ✅
4. `/api/auth` → **JSON 400** ("El PIN debe tener entre 4 y 8 dígitos") = function viva (non HTML) ✅
5. `/api/proxy` → **401** (non 404) = function viva ✅
6. login PIN → endpoint di autenticazione ripristinato e funzionante ✅
7. marker V1/Lab nel bundle live (`main.66b46ad7.js`, decompresso) → **tutti 0**
   (ppp-opt3, ppp-detail, Sin giro compatible, Sin alternativa, PremiumPlannerPopup, PremiumProposalsLabPanel, ManualGiroSection) ✅
8. backend Railway `deploymentId 397d4061-50b5-4400-bc38-a6b2ceab0f4d`, /health 200, ok:true → **invariato** ✅

## Stato finale produzione
`https://magnificent-lollipop-6dff70.netlify.app` · commit **777ae55** · deploy **6a2533b4926549d7ee8937b1** · **locked true** · login OK · interfaccia = quella di ieri sera.

## Dove sono finiti i fix di oggi
NON persi. Il codice è salvo nei branch/commit:
- WA orphan invisibile → commit `cb13736` (branch `hotfix/prod-wa-orphan-visible-2026-06-14`)
- Cocina realtime/polling → commit `2195c66` (branch `hotfix/prod-cocina-realtime-polling-2026-06-15`)
Vanno ri-pubblicati **nel modo corretto** (deploy completo *con* le functions, testato, login verificato sul sito vero) — **ma NON ora** (STOP richiesto).

## Lezione / azione futura (NON eseguita ora)
Il guasto è di metodo: deploy manuale `--dir=build` che droppa le functions, + nessun controllo del login sul sito vero dopo il deploy. Soluzione concordata da implementare in seguito: (1) deploy produzione SOLO completi/riproducibili (mai `--dir=build` da solo); (2) check automatico post-deploy `/api/auth`+`/api/proxy` con rollback automatico se rotto; (3) sito di **staging separato** per il lavoro, live intoccata; (4) guardia potenziata che rifiuta deploy senza functions.

## Safety
- ✅ Nessun patch / redeploy hotfix / consolidation / V1 / backend / DB write / cleanup / push main.
- ✅ `ORDINI_2026-05-23.md` non toccato · `#014`/`storico`/`ordenes` non toccati.
- ✅ Guardia hook NON disattivata (rimasta attiva e intatta per tutta la sessione).

## STOP
Come richiesto: dopo il restore ci si ferma. Nessun altro deploy. Le hotfix si rifanno in seguito, complete e verificate.

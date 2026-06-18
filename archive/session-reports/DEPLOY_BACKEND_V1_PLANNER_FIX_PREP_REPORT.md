# DEPLOY_BACKEND_V1_PLANNER_FIX_PREP_REPORT

Data: 2026-06-17 — **SOLO PREPARAZIONE. Nessun deploy, nessun push, nessuna scrittura DB.** Backend only. Eseguire SOLO dopo la frase esatta: `AUTORIZZO DEPLOY RAILWAY BACKEND V1 PLANNER FIX`.

## 1. Branch / HEAD backend
- Repo: `/Users/bigart/Downloads/ladieci-bot`
- Branch corrente: `backup/v2-route-impact-slip-guard-2026-06-14`
- HEAD: **`193b818`** (`fix planner prefer compatible giro over rider-conflicting direct`)
- `origin/main`: **`0bb9d8c`** · local `main`: `35890ca`
- Backup remoto del fix: `backup/v2-planner-rider-conflict-compatible-giro-2026-06-17` (`193b818a…`)

## 2. Diff `193b818` vs backend live — ⚠️ DATO MATERIALE
- **Live Railway adesso** (`GET /version`, pubblico): `commit:"unknown"`, `branch:"unknown"`, **`deploymentId: 397d4061-50b5-4400-bc38-a6b2ceab0f4d`**, bootTime `2026-06-14T15:20:48Z`. `/health` ok, `/status` yellow (solo per assenza traffico WA, db green).
- `"unknown"` ⇒ il live è stato deployato con **`railway up`**, NON da `main`. Quindi **`origin/main` (0bb9d8c) NON è il codice live**.
- Diff `193b818` vs `origin/main` = **52 commit / 59 file / +13.291 righe** (tutto lo strato premium planner) — grande SOLO perché `main` è rimasto indietro. Il runtime live ha già quasi tutto (il preview strategico funziona già a runtime).
- **Delta reale vs live (~`dc36160`)** = il mio **singolo commit `193b818`** = 3 file:
  - `src/agents/previewStrategicOpportunities.js` (P0 rider-conflict + serviceLine salida/entrega/regreso)
  - `src/core/delivery/deliveryProposalSelector.js` (ranking mejor-operativo)
  - `tests/previewStrategicRiderConflict.test.js` (test)

## 3. File inclusi nel deploy
- Concettualmente la patch da portare a runtime = i 3 file di `193b818`.
- Con **2a (merge→main)** il push porterebbe su `main` TUTTI i 52 commit (allineamento main, atteso/corretto per git), ma il **trigger di deploy** dipende dal punto 6.

## 4. Test verdi (già eseguiti, BLOCCO 6)
- Backend: **63/63 file** `tests/*.test.js` verdi (incl. `previewStrategicRiderConflict` 30/30).
- Frontend: build OK + suite 0 fail (non oggetto di questo deploy).

## 5. Rollback target Railway attuale (REGISTRATO PRIMA)
- **deploymentId LIVE da ripristinare in caso di rollback: `397d4061-50b5-4400-bc38-a6b2ceab0f4d`** (boot 2026-06-14T15:20:48Z, commit "unknown").
- Rollback = Railway dashboard → service `ladieci_bot` → deployment `397d4061…` → **Redeploy**. Oppure, se deploy fatto da main (2a), `git revert` + push main; se da `railway up` (2b), `railway up` dal commit precedente.
- Post-rollback: ri-verificare `GET /health` + `/version`.

## 6. ⚠️ Nodo da sciogliere PRIMA di autorizzare (preferenza 2a)
La preferenza è **2a (push/merge main, tracciabile, `/version` reale)**. Ma:
- `main` è 52 commit indietro e il live è stato messo con `railway up` → **non è confermato che Railway auto-deployi `main`**. CLAUDE.md dice di sì; i deploy recenti (railway up, `/version=unknown`) dicono forse no/bypassato. Non verificabile senza dashboard Railway.
- **Se Railway auto-deploya main:** 2a è ideale → push `193b818`→main, runtime passa a `193b818` con `/version` reale (effettivamente aggiunge solo il fix, il resto è già live).
- **Se Railway NON traccia main:** il push main non cambia il runtime → servirebbe comunque `railway up` (2b), che però dà `/version=unknown` (contro la tua preferenza).

→ **Decisione richiesta all'autorizzazione:** confermare il deploy-source Railway (auto-main vs railway up). Se non confermabile, ripiego 2b accettando `/version=unknown` (mappando deploymentId→commit a mano).

## 7. Piano deploy (2a, condizionato al punto 6)
1. Preflight: `git -C ladieci-bot status` pulito; HEAD `193b818`; ri-run rapido suite backend (atteso 63/63).
2. Registrare rollback target: `397d4061…` (già fatto, punto 5).
3. Allineare `main` a `193b818`: `git checkout main && git merge --ff-only 193b818` (o merge commit se non ff) — **senza push finché non c'è la frase esatta**.
4. **Deploy (solo su frase esatta):** `git push origin main` → attendere build Railway.
5. (fallback 2b se main non è il trigger: `railway up` dal checkout `193b818`.)

## 8. Piano smoke post-deploy
1. `GET /health` (ok), `/status` (db green), `GET /version` → atteso `commit:"193b818…"` (2a) o nuovo `deploymentId` (2b).
2. Staging V1 `https://ladieci-v1-staging.netlify.app` (frontend già live, NON ridepoloyato): login (PIN ambiente → "login OK").
3. Crea **Q5 21:00 EN_COCINA** (DOMICILIO, marker `TEST_V1_PLANNER_2100_Q5_Q2_Q1_DELETE_OK`).
4. Bozza **Q2 20:45** `Calle Cuba 5` — **NON confermare** → `Ver propuestas`.
5. Verifiche (= fix):
   - direct Q2 20:45 **non** è "Mejor propuesta compatible" → `no_recomendado`/`conflicto rider`;
   - giro Q2→Q5 (~20:52/21:04, ajuste) **recommended / mejor operativo** rank 1;
   - `serviceLine` Q5: **salida 20:47 / entrega 21:00 / regreso 21:13** (non "—");
   - card grande segue il `recommended`;
   - Q2 **non** confermato.
6. Catturare `previewOrderPlanner`/`previewStrategicOpportunities` JSON (bestProposal/proposals/serviceLine) come evidenza.

## 9. Piano cleanup (obbligatorio)
- Eliminare SOLO marker `TEST_V1_PLANNER_2100_Q5_Q2_Q1_DELETE_OK` (ordine Q5 + eventuale cliente) via Supabase MCP (se riconnesso) o via UI `eliminaOrdine`.
- Verifica finale: ordenes/clientes/manual_giros/wa_msgs marker = 0.
- ⚠️ Se al momento del test l'MCP è ancora giù e il cleanup UI non è affidabile → valutare prima di creare il Q5 (non lasciare dati orfani).

## Perimetro confermato
- Backend only. Frontend production NON toccata. Netlify production NON toccata. Staging frontend NON ridepoloyato. DB write solo per il Q5/Q2 marker DOPO deploy, con cleanup. Production frontend `069c273`/`6a303f3d`/`02bd4c7a` intoccata.
- `ORDINI_2026-05-23.md` e vecchia app non toccati.

**STOP dopo report. NON deployare senza la frase esatta `AUTORIZZO DEPLOY RAILWAY BACKEND V1 PLANNER FIX`.**

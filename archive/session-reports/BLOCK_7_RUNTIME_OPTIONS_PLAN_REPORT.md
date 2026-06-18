# BLOCK_7_RUNTIME_OPTIONS_PLAN_REPORT

Data: 2026-06-17 — **SOLO PIANO. Nessuna esecuzione, nessun deploy, nessun push, nessuna scrittura DB.**

## Stato sicuro corrente (Opzione C — mantenuto)
- Backend fix committato: **`193b818`** (`fix planner prefer compatible giro over rider-conflicting direct`) su branch `backup/v2-route-impact-slip-guard-2026-06-14`; backup remoto `backup/v2-planner-rider-conflict-compatible-giro-2026-06-17` (`193b818a…`).
- Frontend fix committato: **`922aa13`** (`fix planner popup show recommended proposal`) su `consolidation/nuevo-pedido-v1-unified-2026-06-09`; backup remoto `backup/v1-planner-recommended-card-2026-06-17` (`922aa13b…`).
- Test offline: backend **63/63 file** verdi (incl. `previewStrategicRiderConflict` 30/30) · frontend **build OK** + suite **0 fail**.
- **Runtime PENDING.** Production intoccata. DB invariato.
- Vincolo noto: l'app (anche staging) chiama il backend **Railway deployato** (codice vecchio) → i fix non si vedono a runtime finché non si esegue una delle opzioni sotto.

---

## OPZIONE 1 — runtime con backend locale (se Supabase MCP torna)
**Pre-requisito bloccante:** Supabase MCP riconnesso (per seed + cleanup marker sicuri). Senza, NON procedere (come da STOP 7A).

**Setup (tutto locale, nessun deploy):**
1. Checkout backend a `193b818` (verifica `git -C /Users/bigart/Downloads/ladieci-bot rev-parse --short HEAD`).
2. Avvio backend locale: `node index.js` su una porta libera (es. `PORT=8790`), con env del comando (non committate): `SUPABASE_URL=https://wnswassgfuuivmfwjxsf.supabase.co`, `SUPABASE_KEY=<publishable>` (lettura), `DASHBOARD_API_KEY=<ld_…>`, `JWT_SECRET=<dev-local>`.
   - ⚠️ La publishable key legge ma NON scrive: il seed/cleanup si fanno **via MCP**, non via app→backend.
3. Verifica boot: `GET /health`, `/status`, `/version` (o equivalenti in `index.js:509-645`).
4. **Seed via MCP** (read-only-safe, marker): inserire UN ordine anchor:
   - `id` TEST, `nombre='TEST_V1_PLANNER_2100_Q5_Q2_Q1_DELETE_OK_Q5'`, `estado='EN_COCINA'`, `zona='Q5'`, `hora='21:00'`, `forno_out='20:47'`, `salida_driver_estimada='20:47'`, `entrega_estimada='21:00'`, `durata_andata_min=13`, `tipo_consegna='DOMICILIO'`, `canal='MANUAL'`.
5. Frontend V1 locale (`ladieci-dev` :8888, `c07c68f`/`922aa13`) + **edit locale NON committato** di `ladieci-app33/netlify/functions/api.js` → `RAILWAY_URL` = `http://localhost:8790/api` (ripuntamento proxy al backend locale).
6. Conferma via network/log che `previewStrategicOpportunities` (action `previewStrategicOpportunities`/popup) colpisce **localhost:8790**, non Railway.
7. Bozza Q2 `Calle Cuba 5` 20:45 (NON confermare) → `Ver propuestas`.
8. Verifiche runtime attese (= fix):
   - direct Q2 20:45 **non** è "Mejor propuesta compatible" → `no_recomendado` / `riderConflict`;
   - giro Q2→Q5 (≈20:52/21:04, ajuste) è **recommended / mejor operativo**, rank 1;
   - card grande segue il `recommended`; mappa/ruta coerente con la selezione;
   - `Giros y huecos` Q5 mostra **salida 20:47 / entrega 21:00 / regreso 21:13** (non "—");
   - Q2 **non** confermato.
9. **Cleanup marker via MCP** (`…2100…DELETE_OK`) → verifica ordenes/clientes/manual_giros/wa_msgs = 0.
10. Ripristina `api.js` (scarta l'edit locale non committato). Stop backend locale.
**Report:** `BLOCK_7A2_LOCAL_BACKEND_RUNTIME_TEST_REPORT`.

---

## OPZIONE 2 — deploy Railway backend autorizzato
**Pre-requisito bloccante:** OK ESPLICITO dell'utente al deploy Railway (oggi vietato). Solo backend; il frontend `922aa13` resta su staging V1 (già live, commit c07c68f → la card recommended ha bisogno SOLO del backend nuovo per popolarsi).

**Decisione preliminare (da confermare):** come arriva `193b818` su Railway?
- (2a) **Merge su `main`** del fix + `git push origin main` → Railway auto-deploya `main`. Richiede deroga alla regola "no push main" (deploy autorizzato). Tracciabile, pulito.
- (2b) **`railway up`** dal checkout `193b818` (no push main). Nota da memoria: `railway up` ⇒ `/version=unknown` → mappare deploymentId→commit a mano.
> Raccomandato 2a se l'utente autorizza il push main per il deploy; altrimenti 2b.

**Step:**
1. **Preflight:** `git -C ladieci-bot status` pulito; HEAD/commit = `193b818`; suite backend 63/63 verde (ri-run rapido); confermare nessun altro WIP non committato.
2. **Registrare lo stato corrente per il rollback** PRIMA del deploy: deployment id Railway attivo + commit mappato (da `railway` dashboard/CLI o reflog). Annotare in report.
3. **Deploy** (2a o 2b) — SOLO backend, dietro OK esplicito.
4. **Verifica post-deploy:** `GET https://ladiecibot-production.up.railway.app/health` + `/status` + `/version` (commit atteso `193b818`, o deploymentId nuovo se `railway up`).
5. **Test staging V1** (`https://ladieci-v1-staging.netlify.app`): login (PIN ambiente, "login OK"), crea **Q5 21:00 EN_COCINA** (DOMICILIO, marker) → poi bozza **Q2 20:45** (NON confermare) → `Ver propuestas`. Stesse verifiche dell'Opzione 1 step 8 (direct conflitto, giro recommended, serviceLine salida/regreso, card recommended).
6. **Cleanup marker** (`…2100…DELETE_OK`) via MCP o via UI/eliminaOrdine → 0 ovunque.
7. **Rollback plan (se KO):** ridepoloyare il deployment precedente (registrato allo step 2) — Railway dashboard "Redeploy" del deployment id precedente, oppure `git revert`+push main (2a) / `railway up` dal commit precedente (2b). Backend precedente noto = HEAD deployato attuale (più vecchio di `dc36160`/`193b818`; mappa in memoria `railway-live-deployment-commit-map`). Verificare `/health` post-rollback.
**Report:** `BLOCK_7B_RAILWAY_DEPLOY_RUNTIME_TEST_REPORT`.

---

## Confronto rapido
| | Opzione 1 (locale) | Opzione 2 (Railway) |
|---|---|---|
| Tocca production runtime | No (tutto locale) | **Sì** (backend live) |
| Pre-requisito | MCP riconnesso | OK deploy esplicito (+ eventuale deroga push main) |
| Fedeltà | Alta (codice reale, DB reale in lettura) | Massima (flusso live完整) |
| Rischio | Basso (no deploy, cleanup via MCP) | Medio (serve rollback plan) |
| Reversibilità | Immediata (scarta edit locale) | Via redeploy precedente |

## Guardrail (entrambe)
- Solo dati TEST marker; cleanup marker finale obbligatorio.
- Nessun deploy frontend production/staging; nessun push main salvo deroga esplicita (solo 2a).
- `ORDINI_2026-05-23.md` e vecchia app non toccati.
- Se un pre-requisito manca o il setup diventa ambiguo → STOP.

**STOP dopo il piano. Niente deploy, niente push, niente DB write.**

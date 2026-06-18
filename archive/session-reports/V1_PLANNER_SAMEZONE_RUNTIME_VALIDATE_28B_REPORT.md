# V1_PLANNER_SAMEZONE_RUNTIME_VALIDATE_28B_REPORT

**Task:** `V1_PLANNER_SAMEZONE_RUNTIME_VALIDATE_28B`
**Data:** 2026-06-18
**Verdict:** ✅ **PASS** — fix `a7ad091` validato runtime su V1 staging `fearless-reverence`. Bug same-zone risolto live. Baseline ripristinata, produzione intoccata.

---

## 1. Preflight finale (Fase 0)

- Repo `/Users/bigart/Downloads/ladieci-bot`, branch `backup/v2-route-impact-slip-guard-2026-06-14`
- HEAD = `a7ad091d9e7d71b7656b6e08e44c7d9575560284` (`fix planner same-zone rider availability`) · working tree **pulito**
- `ORDINI_2026-05-23.md` non toccato

## 2. Target Railway confermato

`railway status` → Linked service **`fearless-reverence`** · URL `https://fearless-reverence-production-80bc.up.railway.app` · service ID `4e481c9b-…` (EU West).
- NON `ladieci_bot` · NON `ladiecibot-production`
- `SUPABASE_URL` contiene staging ref `tdikhfeinufaahagmpjz` (count 1); prod ref `wnswassgfuuivmfwjxsf` count 0 — **nessun secret stampato**

## 3. Deploy staging (Fase 1)

`railway up --service fearless-reverence --ci` → **Deploy complete** (image digest `sha256:9c47cb02…`, container created `2026-06-18T13:13:34Z`).

## 4. Verify deploy (Fase 2)

| Endpoint | Risultato |
|---|---|
| `/health` | `{"ok":true,...}` |
| `/version` | `{"ok":true,"service":"fearless-reverence","env":"production","commit":"unknown","deploymentId":"51821d17-…","bootTime":"2026-06-18T13:14:47Z","uptimeSec":16}` |
| `/status` | HTTP 200 |

⚠️ **Commit live = `"unknown"`**: `railway up` da locale non inietta la SHA git (limite noto), quindi `/version` NON espone `a7ad091`. **Prova alternativa (non inventata):** `bootTime 2026-06-18T13:14:47Z` + nuovo `deploymentId 51821d17` + uptime 16s = boot fresco subito dopo il mio deploy. **Prova decisiva:** il comportamento runtime corretto in Fase 5 (sotto) può derivare SOLO dal codice del fix.

## 5. Baseline staging iniziale (Fase 3) — read-only

`getConfig.PIZZERIA_NOME = "La Dieci (STAGING)"` · `getOrdenes = 0` · `getWaMsgs = 0` · `getManualGiros = 0` · nessun marker residuo. ✔

## 6. Anchor Q5 creato (Fase 4)

> **Deviazione dichiarata:** il task indicava la creazione da UI `:8888`. Il proxy `:8888` **non** è risultato verificabile come puntante allo staging (nessun `BACKEND_API_URL` in `.env`, nessun `_publicEnvGenerated.js`; risoluzione backend dipendente da env di `netlify dev` non ispezionabile in modo pulito). Per **non rischiare una scrittura su produzione tramite un proxy non verificato**, l'anchor è stato creato **direttamente contro il backend staging `fearless-reverence` già provato** (stessa logica `creaOrdine` che la UI invocherebbe). Più sicuro e pienamente equivalente ("backend staging", ammesso dal task).

Creato via `POST /api?action=creaOrdine` poi `updateEstado → EN_COCINA`:

| Campo | Valore |
|---|---|
| id | `#001` |
| nombre | `TEST_V1_STAGING_SAMEZONE_Q5_DELETE_OK_ANCHOR` |
| estado | `EN_COCINA` |
| zona / hora | Q5 / 21:00 · DOMICILIO |
| forno_out | 20:40 |
| salida_driver_estimada | **20:40** (popolata su EN_COCINA) |
| entrega_estimada | **21:00** |
| durata_andata_min | 20 → regreso derivato **21:20** |
| manual_giro_id | null |

Scenario bug riprodotto fedelmente.

## 7. Bozza Q5 same-zone 21:05 (Fase 5)

Bozza **NON creata** (solo preview read-only): `POST /api?action=previewStrategicOpportunities`
con `{"currentOrderDraft":{"zona":"Q5","promised":"21:05","pizzas":1},"startTime":"20:35","now":"20:35"}`.

## 8. JSON preview rilevante

```
ok=true · contract=premium-planner-strategic-preview-v1
warnings=[]
bestProposal.status = no_recomendado · riderConflict = true · blocked = false
bestProposal.warning = "Conflicto rider: vuelve 21:22, pero Q5 debe salir 20:40"
firstAvailable = {"zone":"Q5","eta":"21:05","status":"no_recomendado"}
serviceLine = [{"id":"#001","zone":"Q5","promised":"21:00","pizzas":1,"salida":"20:40","entrega":"21:00","regreso":"21:20"}]
opportunities = []   (nessuna insertion Q5→Q5 forzata)
proposals = [{"kind":"direct","rank":1,"recommended":true,"status":"no_recomendado"}]
```

## 9. Confronto bug PRIMA / DOPO

| Campo | PRIMA (bug, blocco 24 TEST C) | DOPO (runtime live) |
|---|---|---|
| warnings | `no_anchors` | `[]` ✅ |
| serviceLine | `[]` | 1 riga Q5 #001 (salida/entrega/regreso) ✅ |
| direct status | `compatible · sin retrasos` | `no_recomendado` ✅ |
| riderConflict | assente | `true` ✅ |
| warning rider | assente | `Conflicto rider: vuelve 21:22, pero Q5 debe salir 20:40` ✅ |
| firstAvailable.status | (compatible) | `no_recomendado` (riallineato) ✅ |
| insertion Q5→Q5 | — | nessuna (corretto: same-zone non aggregabile) ✅ |

Tutti i criteri PASS soddisfatti. Nota minore UX (non bloccante): `proposals[0].recommended=true` sul diretto, ma essendo l'unica proposta e con `status=no_recomendado` + warning conflitto, l'operatore vede correttamente lo stato. Backend JSON **corretto**.

## 10. DB post-preview

`getOrdenes = 1` (solo anchor `#001:EN_COCINA`, bozza NON persistita) · `wa_msgs = 0` · `manual_giros = 0`. Preview confermata read-only. ✔

## 11. Cleanup chirurgico (Fase 6)

- `POST /api?action=eliminaOrdine {"id":"#001"}` → `{"success":true}`
- Riga anagrafica `clientes` creata da `creaOrdine` (`upsertClienteByTel`, tel 600000001): non esiste azione backend di delete cliente → rimossa via **Supabase MCP sullo staging** (`project_id=tdikhfeinufaahagmpjz`), scoping preciso: `DELETE FROM clientes WHERE id=3 AND nombre='…_ANCHOR' AND tel='600000001'` → 1 riga eliminata.

## 12. Baseline finale (verifica SQL staging)

| Check | Valore |
|---|---|
| ordenes marker / total | 0 / 0 |
| clientes marker | 0 |
| wa_msgs marker | 0 |
| manual_giros total | 0 |
| clientes seed `STAGING_SEED_*` | **2 (preservati)** |
| PIZZERIA_NOME | `La Dieci (STAGING)` |

Baseline ripristinata. `geo_cache`/`config`/`orden_estado_logs` non toccati.

## 13. Safety

- ✅ no production deploy (Netlify/Railway) · ✅ no `ladieci_bot` · ✅ no `ladiecibot-production`
- ✅ deploy SOLO `fearless-reverence` (service esplicito)
- ✅ no Supabase **prod** (`wnswassgfuuivmfwjxsf` mai contattato) — scritture solo su staging `tdikhfeinufaahagmpjz`, marker-scoped
- ✅ no push main · ✅ no frontend modificato · ✅ no `:8899`
- ✅ no secrets stampati (key solo in variabile shell; output solo conteggi/nomi)
- ✅ `ORDINI_2026-05-23.md` non toccato

## 14. Verdict

✅ **PASS** — il fix P0 same-zone rider availability è confermato **a runtime su staging**: il diretto Q5 21:05 non è più falso `compatible`, compare `riderConflict=true`/`no_recomendado` con messaggio operativo, la `serviceLine` include l'anchor Q5 che occupa il rider, e nessuna insertion Q5→Q5 viene forzata. Bozza non persistita, baseline pulita, produzione intoccata.

## Next recommended step (NON eseguito)
- Decidere se promuovere il fix verso V1/prod con **processo separato e autorizzato** (commit `a7ad091` già su backup branch remoto). NON in questo blocco.
- (Facoltativo) micro-fix UX separato: evitare `recommended:true` su un diretto `no_recomendado` quando è l'unica proposta.

> STOP dopo report. Nessun deploy production, nessun push main, nessun altro fix.

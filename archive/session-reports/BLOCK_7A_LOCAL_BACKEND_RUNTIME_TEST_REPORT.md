# BLOCK_7A_LOCAL_BACKEND_RUNTIME_TEST_REPORT

Data: 2026-06-17 — **STOP controllato. Setup runtime locale bloccato in modo sicuro. NESSUNA scrittura DB, nessun deploy, nessun push. Production intoccata.**

## Esito: STOP (condizione di perimetro "setup proxy locale ambiguo/rischioso")

Ho verificato la fattibilità **prima** di toccare qualsiasi cosa. Il runtime test locale NON è eseguibile in sicurezza adesso.

## Fattibilità — cosa è OK
- Backend `ladieci-bot` è a **`193b818`** (HEAD verificato). Boot: `node index.js`, `PORT||3000`, env richieste `SUPABASE_URL`, `SUPABASE_KEY`, `DASHBOARD_API_KEY`, `JWT_SECRET`.
- **Lettura** `ordenes` con la *publishable key* (`sb_publishable_…`, già in `auth.js`, non segreta): testata → **HTTP 200**.
- Repointing proxy frontend → `http://localhost:<port>` (edit locale non committato di `RAILWAY_URL` in `ladieci-app33/netlify/functions/api.js`): fattibile.

## Blocchi reali (perché STOP)
1. **Serve l'anchor Q5 nel DB.** Il flusso live non accetta anchor espliciti: il dispatcher costruisce gli anchor da `loadPlannerSnapshot` (Supabase). Quindi il Q5 EN_COCINA deve **esistere nel DB** perché `previewStrategicOpportunities` lo veda come anchor e attivi il rider-conflict.
2. **Nessun canale di scrittura sicuro disponibile ora:**
   - **Supabase MCP DISCONNESSO** ("connection invalidated") — era lo strumento pulito per seed + cleanup marker.
   - **Scrittura REST diretta (publishable key) BLOCCATA dal classifier** (modifica DB prod condiviso). Nessuna riga è stata scritta (verifica read-only post: `ordenes` marker = `[]`).
   - **Backend locale → Supabase write** richiede `SUPABASE_KEY` **service_role**, presente solo come env su Railway, **non in repo / non disponibile** localmente. Con la publishable key le scritture sono governate da RLS.
3. **Cleanup marker finale non garantibile** (MCP giù + write dirette bloccate) → eseguire il seed violerebbe il requisito "cleanup marker finale" e rischierebbe dati TEST orfani sul DB prod.

## Cosa NON è stato fatto
- ❌ Nessun ordine TEST creato (Q5/Q2). ❌ Nessuna scrittura su Supabase. ❌ Backend locale non avviato (nessun seed → test non significativo). ❌ Nessun deploy/push. ❌ `ORDINI_2026-05-23.md` non toccato.

## Per sbloccare 7A (richiede decisione utente)
Serve almeno UNO di:
- **A)** Riconnettere il **Supabase MCP** → io semino l'anchor Q5 marker (read-only-safe via MCP), avvio backend locale + proxy ripuntato, eseguo il preview, poi cleanup marker via MCP.
- **B)** Fornire/abilitare la **`SUPABASE_KEY` service_role** per il backend locale (in env del comando, non committata) → seed/cleanup via l'app→backend-locale, flusso più fedele.
- **C)** In alternativa, accettare la validazione **solo offline** già fatta (BLOCCO 6: 30/30 sul fixture Q5 21:00 + Q2 20:45, 63/63 backend) e rimandare il runtime al **deploy Railway** autorizzato (BLOCCO 7 "classico").

## Stato
- Fix backuppati: backend `193b818` (`backup/v2-planner-rider-conflict-compatible-giro-2026-06-17`), frontend `922aa13` (`backup/v1-planner-recommended-card-2026-06-17`).
- Validazione offline BLOCCO 6 verde. **Runtime ancora PENDING.**
- Production intoccata. DB invariato (nessuna scrittura).

**STOP dopo report. Nessun deploy, nessun push.**

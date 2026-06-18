# V1_WRONG_APP_TEST_ABORT_15_REPORT

Data: 2026-06-16 — **ABORT su richiesta utente. Nessun cleanup eseguito (in attesa conferma). Nessun nuovo ordine. Production intoccata.**

## 1. Cosa sto usando — fatti esatti

| Voce | Valore |
|---|---|
| URL usato per il test | **http://localhost:8888** (localhost) |
| Porta localhost | **8888** (netlify dev; CRA interno su :3002) |
| Branch corrente | `consolidation/nuevo-pedido-v1-unified-2026-06-09` |
| HEAD | `c07c68f` |
| git status (src/scripts) | pulito |
| localhost `version.json` | `commit c07c68f`, `branch consolidation/...`, context production |
| Dev server avviato da | `/Users/bigart/Downloads/LaDieciBotV2-github/ladieci-app33` (la repo V1) |

→ **Il frontend sorgente su :8888 È la V1** (commit `c07c68f`, branch consolidation), NON la vecchia app.

### ⚠️ MA — caveat importante e onesto
1. **Non ho interagito con la UI V1 in un browser.** Ho eseguito il test **a livello API**, chiamando direttamente le function `/api/auth` e `/api/proxy` (azioni `createOrden`, `previewStrategicOpportunities`) servite dal localhost V1. Sono le **stesse azioni backend** che il modal V1 chiama, ma **non ho renderizzato né cliccato** il `NuevoPedidoModal` / popup `Propuestas de entrega` in un browser.
2. **Non ho potuto provare i marker V1 nel bundle servito.** In dev mode il JS è servito dalla memoria di webpack; via il proxy netlify dev i path statici (`/static/js/bundle.js`) tornano il **fallback index (587 byte)**. Significa che, **così com'è, il browser su :8888 potrebbe NON renderizzare la UI V1** (problema di proxy statico del dev server). Le function invece funzionano (login + preview OK).
3. Esiste **un'altra app in esecuzione**: il checkout **`LaDieciBotV2-p1a`** (vecchia UI / P1A) su **:8899** (+ CRA :3000). **NON l'ho usata** per le mie chiamate (ho usato solo :8888). È però fonte di confusione e occupa la porta 3000.

→ **Conclusione onesta:** il backend/contract che ho testato è quello giusto (path V1), ma **non ho una prova visiva** che la UI V1 si renderizzi a :8888, e i miei risultati finora sono **findings di backend/contract**, non di rendering del modal V1.

## 2. Conferme richieste
- Branch `consolidation/nuevo-pedido-v1-unified-2026-06-09` → **SÌ**
- HEAD `c07c68f` → **SÌ**
- Staging `https://ladieci-v1-staging.netlify.app` → **NON usato in questo test** (esiste, deploy `6a3050ec`, bundle reale `main.4a15067f.js` che **renderizza** la V1; è l'ambiente browser-affidabile).
- Localhost avviato dalla branch V1 → **SÌ** (`-github` @ `c07c68f`).

## 3. Marker UI V1 (`Propuestas de entrega`, `Giros y huecos`, `PremiumPlannerPopup`, `ppp-prop`, nuova mappa, V1 Planner UX)
**NON verificati visivamente.** Non ho aperto la UI in un browser e non ho potuto grepparli dal bundle servito (vedi caveat #2). Sono presenti nel **sorgente** `c07c68f` (provato nei test precedenti: bundle di produzione staging `main.4a15067f.js` contiene `Propuestas de entrega`/`Giros y huecos`/`ppp-prop`), ma **non confermati nel rendering live di :8888**.

## 4. Ordini TEST creati — DA NON eliminare finché non confermi

**Questa sessione (test same-giro):**
| Campo | Valore |
|---|---|
| Quantità | **1** |
| Marker | `TEST_V1_PLANNER_SAME_GIRO_GAP_2026_06_16_DELETE_OK` |
| ID | **#001** |
| Zona / hora / estado | Q5 / 11:25 / EN_COCINA |
| tel / canal | "" (nessun cliente) / MANUAL (nessun wa_msg) |
| Ambiente frontend | localhost:8888 (V1, c07c68f) |
| Ambiente DATI | **DB Supabase di PRODUZIONE** (è l'unico DB: localhost/staging/prod condividono lo stesso Railway+Supabase) |

→ È **chiaramente TEST** (marker nel nome, nessun dato reale, fake, EN_COCINA). **NON eliminato.**

**Sessione precedente** (marker `TEST_V1_PLANNER_RUNTIME_2026_06_15…`): **0 residui** (già eliminati a fine test precedente, verificato ora).

## Stato attuale
- **#001 (Q5) È ANCORA IN DB** sul Supabase di produzione. Non toccato.
- Localhost :8888 (V1) ancora attivo. App `-p1a` :8899 attiva (non mia, non usata).
- Production frontend `069c273 / 6a303f3d / locked` → intoccata. Repo pulito `c07c68f`.

## Raccomandazione
Per un test **della UI V1 vero** (vedere il popup, Aplicar, box vs riga giro) conviene usare lo **staging V1** `https://ladieci-v1-staging.netlify.app` (bundle reale che renderizza) con un **browser**, oppure sistemare il serving statico del dev :8888. Le chiamate API che ho fatto sono valide per i **findings di backend** (es. `serviceLine` salida/entrega null = bug mapping backend), ma NON sostituiscono la verifica visiva del modal V1.

**Domanda per te:** confermi che **#001 (marker, Q5, EN_COCINA)** è solo TEST e posso eliminarlo? E vuoi che il test V1 prosegua su **staging V1 (browser)** invece che su localhost API?

**STOP dopo report.** Nessun cleanup, nessun nuovo ordine, nessun deploy/push, production intoccata.

# V1_PLANNER_CONTRACT_READONLY_07_REPORT

Data: 2026-06-15 — **SOLO LETTURE. Nessun deploy, nessun DB write, nessun ordine, nessuna patch, production intoccata.**

## Sicurezza / perimetro
Frontend branch `consolidation/nuevo-pedido-v1-unified-2026-06-09`, HEAD `c07c68f`, tree pulito. NO production / Netlify prod / Railway deploy / backend patch / DB write / ordini / push / main. `ORDINI_2026-05-23.md` non toccato. **Nessun file del repo modificato.** Audit di codice backend (read-only) sul repo locale `/Users/bigart/Downloads/ladieci-bot`.

## Nota sulla chiamata runtime live
L'azione read-only era `previewStrategicOpportunities` (POST proxy → Railway, `safety {readOnly:true, writes:false, pii:"redacted"}`). Il tentativo di chiamarla **direttamente sul backend di produzione** è stato **bloccato dal classificatore di sicurezza** (API key in chiaro + POST a prod + ambiguità rispetto al perimetro NO-backend/NO-production). Coerente con la regola del task ("se rischio/ambiguità → STOP e reporta"), **non ho forzato**. 

Pivot in-perimetro: ho validato il contract **leggendo il codice sorgente del backend che lo costruisce** (sorgente di verità, zero rete, zero scritture). Probe innocue eseguite: `/health` → `{ok:true}`, `/status` → `level:yellow, database green`. Backend live = commit `unknown`, uptime ~27h.

## Catena del contract (file backend reali)
- `agents/previewStrategicOpportunities.js` → response `premium-planner-strategic-preview-v1`
- `core/delivery/strategicOpportunities.js:272` → `anchorId: anchor.id`
- `core/delivery/premiumPlannerBridge.js:144` → `giroId: option.giro_id ?? context.giroId`
- `core/delivery/premiumPlannerOpportunities.js:117/134` → `giroId` (null per `crear`, anchor.id per insertion)
- `core/delivery/deliveryProposalSelector.js:87` → `proposal.id = opp.id`

## Verifica campi — PASS/FAIL

| Campo / requisito | Esito | Evidenza (sorgente backend) |
|---|---|---|
| `proposals` presente (additive, anche su errore `[]`) | **PASS** | `previewStrategicOpportunities.js:203/523`; selector `contract proposals: capped` |
| `proposals[].id` | **PASS** | `toProposal: id: str(opp.id)` (= id dell'opportunity) |
| `proposals[].giroId` diretto | **FAIL (assente)** | il selettore NON copia `giroId` sulla proposal |
| `giroId` risolvibile via opportunity | **PASS** | frontend `proposalGiroId` → `resolveProposalOpp(p)` (`opp.id===p.id`) → `opp.giroId`. Già implementato nel cablaggio `c07c68f` |
| `opportunities[].giroId` | **PASS** | bridge `:144` + opportunities `:134`; blocked path `:320` → tutti `giroId` camelCase |
| `serviceLine` presente | **PASS** | `:506` map sugli anchors (sempre array) |
| `serviceLine[].id` | **PASS** | `:507 id: a.id` |
| match proposal ↔ serviceLine | **PASS** | `opp.giroId == cand.anchorId == anchor.id == serviceLine.id` (catena unica) |
| salida / entrega / regreso per giro | **PASS (con fallback)** | `:511-515`: `salida`, `entrega ?? promised`, `regreso`; null→`—` in UI (mai inventati) |
| `no_recomendado` (forma) | **PASS** | candidati bloccati → `status:'no_recomendado', blocked:true`; selector li marca `kind:'not_recommended'` → frontend li esclude dai box primari |
| recommended / best | **PASS** | `firstAvailable` + `bestProposal` nel contract (`:500-501`) |
| nessun dato inventato frontend | **PASS** | tutti i valori derivano dagli anchors/opportunities reali; campi mancanti → `—`/empty-state |

## Campi mancanti
- **`proposals[].giroId` non emesso direttamente** dal selettore. **Non bloccante**: il frontend lo risolve via `opportunities[]` (mapping già presente nel commit `c07c68f`). Le `opportunities[]` sono additive e sempre nel contract, quindi il match è disponibile.

## Osservazioni (non bug)
- Doppia convenzione interna `giroId` (camelCase, output) vs `giro_id` (snake, `syntheticOption` interno): convergono entrambe su `giroId` al confine del contract → coerente.
- `direct`/`crear` hanno `giroId = null` (nessun giro): il box "Directa" correttamente **non** apre righe → comportamento atteso, non difetto.
- `salida`/`regreso` dipendono dalla ricchezza degli anchor reali: se il backend non li valorizza, la riga mostra `—` su quelle gambe (degradazione leggibile, nessun crash).

## Rischio compatibilità UI
**Basso.** La struttura del contract reale combacia con quanto il cablaggio `c07c68f` si aspetta:
- selezione proposta → risolve `giroId` via opportunity → apre la riga `serviceLine` corrispondente;
- riga → seleziona la proposta collegata;
- `no_recomendado` resta avviso, non CTA;
- empty-state quando proposals/serviceLine vuoti.
Unico residuo **non verificabile da audit statico**: i **valori runtime reali** (proposals non vuote sotto carico reale, ricchezza di salida/regreso) — proprio ciò che lo staging lab serve a osservare.

## Raccomandazione
**A) contract OK → pronto per backup branch + staging lab.**

Lo schema del contract reale espone tutti i campi necessari al cablaggio (`serviceLine.id`, `opportunity.giroId`, match anchor, salida/entrega/regreso, no_recomendado, best). Il solo "FAIL" (`proposals[].giroId` diretto) è **già coperto** dal frontend via `opportunities[]` → nessun micro-fix richiesto (**non** opzione B), nessun task backend necessario (**non** opzione C).

Caveat per lo staging: confermare **on-screen con anchor reali** che (1) le proposte arrivino non vuote, (2) salida/regreso siano valorizzati, (3) il clic apra davvero la riga giro. Se si vuole un campione JSON runtime prima dello staging, serve un'autorizzazione esplicita per la chiamata read-only (o eseguirla da una sessione app loggata via proxy), che in questa sessione è stata correttamente bloccata.

**STOP.** Nessun commit, nessun deploy, nessun push.

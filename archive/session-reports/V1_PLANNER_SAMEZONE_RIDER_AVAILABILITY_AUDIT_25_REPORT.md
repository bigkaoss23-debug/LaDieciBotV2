# V1_PLANNER_SAMEZONE_RIDER_AVAILABILITY_AUDIT_25_REPORT

**Task:** `V1_PLANNER_SAMEZONE_RIDER_AVAILABILITY_AUDIT_25`
**Tipo:** READ-ONLY AUDIT — nessuna patch, nessun commit, nessun deploy, nessun DB write.
**Data:** 2026-06-18
**Verdict:** ✅ **AUDIT COMPLETE** — root cause CERTA, riproducibile via unit test. È un bug **backend JSON** (non solo UX).

---

## 1. Repo / branch / commit ispezionato

- **Repo backend:** `/Users/bigart/Downloads/ladieci-bot` (il backend reale; il frontend `LaDieciBotV2-github` NON è stato toccato)
- **Branch:** `backup/v2-route-impact-slip-guard-2026-06-14`
- **HEAD:** `193b818a77afad33129d4cf45f075391ce48371e` (`193b818` — "fix planner prefer compatible giro over rider-conflicting direct")
- Coincide con il commit backend testato a runtime su Railway V1 `fearless-reverence`.

## 2. Working tree status

```
git status --short  →  (vuoto)
```
Working tree **pulito**. Nessuna modifica pendente. Audit eseguito su codice committato.

## 3. File e funzioni coinvolte

| File | Funzione | Ruolo nel bug |
|---|---|---|
| `src/agents/previewStrategicOpportunities.js` | `buildAnchorsFromSnapshot` (L335–361) | **Origine del bug**: filtro same-zone L354 |
| stesso file | `previewStrategicOpportunities` (L592–737) | orchestratore; usa l'unica lista `anchors` per 3 scopi |
| stesso file | `findRiderConflictAnchor` (L185–198) | rilevamento conflitto rider — **corretto, ma riceve `anchors` già svuotato** |
| stesso file | `buildStrategicPreviewResponse` (L530–588) | costruisce `serviceLine` da `anchors` (L557–565) |
| stesso file | `sanitizeAnchor` (L279–315) | deriva salida/entrega/regreso anchor — corretto |
| `tests/previewStrategicRiderConflict.test.js` | E2E conflitto | copre solo anchor cross-zone passati **espliciti** (bypassa il filtro) |

## 4. Flusso attuale del planner per Q5 same-zone

Scenario runtime (TEST C, blocco 24):
- Anchor Q5 #001 esistente: `EN_COCINA`, hora 21:00, salida 20:40, entrega 21:00, regreso 21:20.
- Bozza: Q5 21:05 (stessa zona).
- Anchor caricati **dallo snapshot** (`loadSnapshot`), NON passati espliciti.

Sequenza:
1. `previewStrategicOpportunities` → ramo snapshot (L613–635) → `buildAnchorsFromSnapshot(snapshot, { currentOrderZone: "Q5", ... })`.
2. Dentro `buildAnchorsFromSnapshot`, l'anchor Q5 passa i filtri tipo/stato (DOMICILIO + EN_COCINA = eleggibile)… ma incontra il **filtro same-zone L354**:
   ```js
   if (currentZone != null && zone === currentZone) continue;   // ← scarta Q5
   ```
   → l'anchor Q5 viene **scartato dall'unica lista `anchors`**.
3. `anchors = []`.
4. Da qui la **singola lista vuota** alimenta TRE consumatori:
   - **rider conflict** (L672): `findRiderConflictAnchor(bestProposal, anchors=[])` → nessun anchor → ritorna `null` → il diretto resta `compatible`.
   - **no_anchors** (L701): `if (!anchors.length)` → warning `no_anchors`.
   - **serviceLine** (L557): `anchors.map(...)` su `[]` → `serviceLine: []`.

Risultato JSON: direct `Crear giro Q5 · compatible`, `no_anchors`, `serviceLine: []`, nessun `riderConflict`. Esattamente l'output osservato.

## 5. Punto preciso dove l'anchor Q5 viene escluso

`src/agents/previewStrategicOpportunities.js:354`
```js
// same-zone del current → dominio del planner classico, non strategic.
if (currentZone != null && zone === currentZone) continue;
```
Filtro "A1" (documentato L321–328). **Concettualmente giusto per la generazione candidati di insertion** (lo strategic layer serve solo opportunità cross-zone; un leg Q5→Q5 degraderebbe a `blocked/missing_travel_times`). **Sbagliato come unico punto di esclusione**, perché rimuove l'anchor anche dai vincoli rider e dalla serviceLine.

## 6. Punto preciso dove `serviceLine` diventa `[]`

`src/agents/previewStrategicOpportunities.js:557`
```js
serviceLine: (Array.isArray(anchors) ? anchors : []).map((a) => ({ ... })),
```
La serviceLine è costruita dalla **stessa** lista `anchors` già svuotata al passo 4. Non c'è una sorgente separata "ordini che occupano il rider".

## 7. Punto preciso dove riderConflict non viene calcolato

`src/agents/previewStrategicOpportunities.js:671–693` (in particolare L672):
```js
const conflictAnchor = findRiderConflictAnchor(bestProposal, anchors);  // anchors = []
```
`findRiderConflictAnchor` è **corretto** (verificato: con l'anchor Q5 #001 e il diretto Q5 21:05, gli intervalli `[salida,regreso]` si sovrappongono → ritornerebbe l'anchor). Ma riceve `anchors=[]`, quindi `conflictAnchor = null` e il blocco di degradazione a `no_recomendado` (L673–693) **non scatta**. Il diretto resta `compatible`.

## 8. Root cause (CERTA)

**Una sola lista `anchors` conflà tre responsabilità distinte.** Il filtro same-zone (L354), pensato solo per escludere candidati di *aggregazione/insertion*, svuota la lista che serve anche a:
1. calcolare il **conflitto rider** (occupazione single-rider), e
2. costruire la **serviceLine** (giri che bloccano il rider).

Un ordine same-zone non è aggregabile dallo strategic layer, **ma occupa comunque il rider**. Escludendolo del tutto, il planner "dimentica" che il rider è impegnato fino alle 21:20 e vende il diretto Q5 21:05 come `compatible · sin retrasos`.

Non è un bug di `findRiderConflictAnchor` né di `sanitizeAnchor` (entrambi corretti). Non è solo UX: il **JSON backend è oggettivamente sbagliato** (`bestProposal.status = "compatible"`, `riderConflict` assente, `serviceLine = []`).

**Perché i test esistenti non lo hanno colto:** `tests/previewStrategicRiderConflict.test.js` passa gli anchor **espliciti** via `input.anchors` (L611–612), che **bypassa completamente `buildAnchorsFromSnapshot`** e quindi il filtro same-zone. Inoltre tutti gli scenari sono **cross-zone** (draft Q2 + anchor Q5). Il caso same-zone + anchor-da-snapshot non è coperto.

## 9. Opzioni fix (con pro/contro) — NON implementate

### Opzione A — Separare `candidateAnchors` da `riderBusyAnchors` *(consigliata)*
`buildAnchorsFromSnapshot` ritorna due liste (o si aggiunge una funzione gemella): una **senza** same-zone (per la generazione candidati/insertion, comportamento attuale) e una **con** same-zone (per conflitto rider + serviceLine). L'orchestratore usa `riderBusyAnchors` a L672 e per la serviceLine, e `candidateAnchors` per `makeCandidates`.
- ✅ Rispetta tutte le regole §5: same-zone escluso dalle proposals di insertion ma presente nei vincoli temporali e in serviceLine.
- ✅ Cambiamento chirurgico, additivo; non tocca routeImpact/strategicOpportunities.
- ✅ `no_anchors` può restare legato ai *candidati* (corretto: davvero non c'è candidato di insertion), mentre serviceLine mostra il giro che blocca.
- ⚠️ Richiede di decidere se la serviceLine deve includere anche gli anchor same-zone (sì, per mostrare il giro bloccante).

### Opzione B — Spostare il filtro same-zone dentro la generazione candidati
Tenere `anchors` completo (same-zone incluso) in `buildAnchorsFromSnapshot`, e applicare lo skip same-zone **solo** in `makeCandidates`/`mapCandidateToOpportunity` (dove genera l'insertion).
- ✅ Una sola lista, conflitto e serviceLine "gratis".
- ⚠️ Rischio: `buildStrategicCandidates` potrebbe generare un candidato same-zone che degrada a `blocked/missing_travel_times` (rotta [Q5,Q5]) → riapre il problema UI che il filtro A1 voleva evitare. Va gestito esplicitamente.
- ⚠️ Più invasivo su `strategicOpportunities.js`.

### Opzione C — Fallback a `resolveRiderAvailability` (`src/core/delivery/riderAvailability.js`)
Calcolare l'occupazione rider da una sorgente indipendente dagli anchor strategici.
- ✅ Disaccoppia del tutto il vincolo rider dalla pipeline candidati.
- ⚠️ Modulo separato (147 righe) da integrare nell'adapter offline; rischio di doppia fonte di verità sugli orari; più lavoro e più superficie di regressione. Sproporzionato per questo bug.

## 10. Fix consigliato (senza implementarlo)

**Opzione A.** Introdurre `riderBusyAnchors` (= anchor eleggibili EN_COCINA/LISTO, **incluso same-zone**, anti-stale applicato) distinta da `candidateAnchors` (= attuale, same-zone escluso). Wiring:
- L672 `findRiderConflictAnchor(bestProposal, riderBusyAnchors)`
- serviceLine (L557) costruita da `riderBusyAnchors`
- `makeCandidates` (L704) continua con `candidateAnchors`
- `no_anchors` (L701): valutare su `candidateAnchors` (semantica invariata) **oppure** declassare a warning informativo quando esistono `riderBusyAnchors` (la serviceLine non sarà più vuota → coerenza UI).

Regola operativa rispettata: *"se un anchor non è aggregabile può essere escluso dalle proposals di insertion, ma deve restare nei vincoli temporali e in serviceLine."*

## 11. Test unitari da aggiungere

1. **Same-zone da snapshot → riderConflict** (il caso mancante chiave): `currentOrderDraft` Q5 21:05 + **snapshot** con anchor Q5 #001 EN_COCINA (NON anchors espliciti) → attendi `bestProposal.status === "no_recomendado"`, `riderConflict === true`, `serviceLine` con la riga Q5 #001.
2. **Same-zone non genera candidato di insertion**: stesso input → nessuna `opportunity kind === "agregar"` Q5→Q5, nessun `blocked/missing_travel_times` fantasma.
3. **serviceLine popolata anche senza candidati**: anchor same-zone presente, `opportunities` vuoto → `serviceLine.length === 1`.
4. **Regressione no_anchors**: nessun anchor di alcun tipo → `no_anchors` + serviceLine `[]` invariati.
5. **Same-zone non in conflitto**: anchor Q5 con finestra rider che NON si sovrappone al diretto → `riderConflict` assente, direct `compatible` (evita falsi positivi).
6. **`buildAnchorsFromSnapshot` two-list**: unit diretto sulla funzione (o gemella) → `candidateAnchors` esclude same-zone, `riderBusyAnchors` lo include.

## 12. Rischi di regressione sui casi già PASS

Il fix consigliato (Opzione A) è additivo e tocca solo il wiring del conflitto rider/serviceLine. Casi da ri-verificare verdi:

| Caso PASS | Rischio | Note |
|---|---|---|
| Q2 20:25 — direct compatibile, insertion no_recomendado | **Basso** | cross-zone; `candidateAnchors` invariato; il rider Q2 rientra prima della salida Q5 → nessun nuovo conflitto. Verificare che findRiderConflict non scatti falso positivo. |
| Q2 20:45 — Q2→Q5 recommended | **Basso** | cross-zone; pipeline candidati invariata. |
| Q2 20:55 — direct no_recomendado / insertion ajuste | **Basso** | già usa il conflitto rider via anchor cross-zone; comportamento invariato. |
| Q1 20:45 — Q1→Q5 recommended | **Basso** | cross-zone; invariato. |
| Q4 oeste — no cross-channel Q4→Q5 | **Nullo** | gestito da riconciliazione cross-channel (L469–476), indipendente dal filtro same-zone. |

Rischio principale da sorvegliare: **falsi positivi di conflitto rider** ora che gli anchor same-zone entrano nel calcolo. Mitigazione: `findRiderConflictAnchor` è già conservativo (richiede salida+regreso su entrambi gli intervalli, altrimenti nessun conflitto). Il test #5 copre il non-conflitto same-zone.

---

## VERDICT

✅ **AUDIT COMPLETE**

- Root cause **certa**: filtro same-zone `previewStrategicOpportunities.js:354` svuota l'unica lista `anchors`, condivisa tra generazione candidati, conflitto rider e serviceLine.
- Bug **backend JSON** confermato (non solo UX).
- Riproducibile con unit test (#1 §11) usando lo **snapshot** (non anchor espliciti) e draft same-zone.
- Fix consigliato: **Opzione A** (separare `candidateAnchors` da `riderBusyAnchors`).
- **NESSUNA patch applicata. STOP come da task.**

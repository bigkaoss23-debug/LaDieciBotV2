# FRONTEND_WA_ORPHAN_VISIBLE_HOTFIX_01 — REPORT

**Data:** 2026-06-15 (post-servizio)
**Base obbligatoria:** `777ae55` ✅
**Branch:** `hotfix/prod-wa-orphan-visible-2026-06-14` (commit `cb13736`) — creato in **git worktree isolato** da `777ae55`, NON da `consolidation`.
**Scope:** SOLO frontend Pedidos/WA. Nessun Planner UX / V1 incluso.
**Deploy:** ❌ NON eseguito. In attesa di autorizzazione esplicita (regola prod: solo da `main` con OK utente).

---

## Problema risolto

Un ordine creato dal **modal Nuevo Pedido** col bottone "💬 WhatsApp" veniva salvato in `ordenes` con `canal="WA"` ma **senza `wa_id` e senza riga `wa_msgs`** → **invisibile in ogni tab**:
- `TabManual`/Pedidos filtrava `MANUAL/TEL/vuoto` → scartava WA;
- `TabWA` disegna solo dalla tabella `wa_msgs` → nessuna riga da mostrare.

Effetto live: l'operatore non vedeva l'ordine, lo credeva cancellato e lo ricreava (duplicato). Casi reali: **#014** (2026-06-14) e **"ordine #1"** della sessione precedente. Diagnosi completa in `ORDER_GAP_011_015_COCINA_DELAY_AUDIT_01_REPORT.md`.

---

## Modifiche (5 file, +33 / −2 sui 3 componenti)

### 1. `src/utils/pedidosVisibility.js` (NUOVO) — helper puro condiviso (DRY)
Centralizza la regola di appartenenza al tab Pedidos, usata identica da `TabManual` e `OrdenCard`:
- `belongsToPedidos(o)` → `MANUAL` / `TEL` / canal vuoto / **WA senza wa_id (orfano)**.
- `isWaSinConversacion(o)` → `canal==="WA"` con wa_id vuoto.
- `isWaOrigen(o)` → ordine non-BANCO con wa_id valorizzato (origine WhatsApp).

### 2. `NuevoPedidoModal.jsx` — Fix 1 (prevenzione alla sorgente)
Il bottone "💬 WhatsApp" non salva più `canal="WA"`:
```diff
- canal: canal === "WA" ? "WA" : canal === "BANCO" ? "BANCO" : "MANUAL",
+ canal: canal === "BANCO" ? "BANCO" : "MANUAL",
+ wa_id: canal === "WA" ? String(tel || "").replace(/\D/g, "") : "",
```
→ l'ordine è sempre visibile in Pedidos (MANUAL); l'origine WhatsApp resta tracciata in `wa_id` (telefono) e mostrata come badge. **Non crea riga `wa_msgs`.**

### 3. `TabManual.jsx` — Fix 2 (rete di sicurezza)
```diff
- const all = ordenes.filter(o=>o.canal==="MANUAL" || o.canal==="TEL" || !o.canal);
+ const all = ordenes.filter(belongsToPedidos);
```
→ include gli orfani `canal=WA` senza `wa_id` (legacy o da altre sorgenti) così **non resta mai nessun ordine invisibile**. Gli ordini WA **con** `wa_id` restano nel flusso WhatsApp.

### 4. `OrdenCard.jsx` — badge origine
- `💬 WA sin conversación` (ambra) per gli orfani `canal=WA` senza wa_id.
- `💬 WhatsApp` (verde) per gli ordini manuali con origine WhatsApp (wa_id valorizzato).

### 5. `pedidosVisibility.test.js` (NUOVO) — 11 unit test

---

## Test — TUTTI VERDI

`CI=true react-scripts test` → **11 passed / 11**:

| Requisito del task | Esito |
|---|---|
| MANUAL appare in Pedidos | ✅ |
| TEL appare in Pedidos | ✅ |
| BANCO **non** appare in Pedidos | ✅ |
| WA con conversazione (wa_id) resta nel flusso WA | ✅ |
| WA senza conversazione (no wa_id) appare in Pedidos fallback | ✅ |
| Nessun ordine POR_CONFIRMAR resta invisibile (ogni canale coperto da un tab) | ✅ |
| Badge: orfano → "WA sin conversación"; manuale-WA → "WhatsApp"; TEL puro → nessun badge | ✅ |

**Build di produzione:** `react-scripts build` → *Compiled successfully* (222.72 kB gzip, in linea con la prod 225 kB). Nessun errore/lint-as-error.

---

## Effetto su #014 (ordine orfano ancora vivo)
Dopo il deploy di questo hotfix, **#014** (canal=WA, wa_id vuoto, POR_CONFIRMAR) comparirà in **Pedidos** col badge "💬 WA sin conversación" → l'operatore potrà finalmente confermarlo o eliminarlo. (Oggi resta invisibile fino al deploy.)

---

## Punto di review (1) — da validare prima del deploy
`wa_id = telefono` su un ordine `canal=MANUAL`: verificare che il backend `creaOrdine` (Railway `dc36160`) **(a)** persista `wa_id` anche per canal≠WA (serve al badge) e **(b)** NON inneschi effetti WhatsApp (invio messaggi / creazione conversazione) per un ordine MANUAL. Atteso: innocuo (TabWA legge `wa_msgs`, non `ordenes.wa_id`; nessuna riga `wa_msgs` viene creata). Se il backend ignorasse `wa_id` per i MANUAL, l'unico effetto è la perdita del badge "WhatsApp" — l'ordine resta comunque **visibile** (la correttezza non dipende dal badge). Nessuna modifica backend in questo hotfix.

---

## Safety / vincoli rispettati
- ✅ Base `777ae55`, worktree isolato (il branch `consolidation` e il suo working tree NON sono stati toccati).
- ✅ Nessun Planner UX / V1.
- ✅ Nessun deploy (Netlify prod resta `777ae55` / `6a2533b4926549d7ee8937b1`, locked).
- ✅ Backup branch committato: `hotfix/prod-wa-orphan-visible-2026-06-14` @ `cb13736`.
- ✅ Nessuna modifica DB / schema / backend.

---

## Prossimo passo (richiede TUO OK esplicito)
Quando autorizzi il deploy: merge/cherry-pick di `cb13736` su `main` → build → deploy Netlify sul site `02bd4c7a` con `--site` esplicito. Vedi regola `[[prod-frontend-deploy-rule-and-guards]]`. Non procedo senza "vai / deploya".

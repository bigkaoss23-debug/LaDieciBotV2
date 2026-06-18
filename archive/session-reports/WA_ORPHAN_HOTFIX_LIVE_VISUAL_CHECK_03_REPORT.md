# WA_ORPHAN_HOTFIX_LIVE_VISUAL_CHECK_03 — REPORT

**Data:** 2026-06-15 (post-hotfix, fuori servizio)
**Modalità:** READ-ONLY. Zero deploy / patch / DB write / cleanup / state change / push main. `ORDINI_2026-05-23.md` non toccato.
**Production live:** commit `cb13736` · deploy `6a2fab72f27a0e26497d4f4c` · locked true · site `02bd4c7a`.

---

## VERDETTO: ✅ OK — aspetto live INVARIATO, hotfix attiva sotto al cofano

- La live ha **lo stesso aspetto di prima**: selettore canale a 3 bottoni (Teléfono / WhatsApp / Barra) **byte-identico** a 777ae55.
- Il bottone "💬 WhatsApp" **non crea più ordini orfani invisibili** (logica di salvataggio corretta).
- Nessun orfano WA attivo al momento (servizio chiuso, `ordenes` vuota).

---

## PARTE A — Production live (solo verifica)

### A1 — Tre canali visivi invariati ✅
`cb13736` riga 849, **identica** a 777ae55 (la hotfix NON l'ha toccata):
```jsx
{[{ id:"TEL", label:"📞 Teléfono" }, { id:"WA", label:"💬 WhatsApp" }, { id:"BANCO", label:"🏪 Barra" }].map(...)}
```
Il mio diff tocca solo il **payload di salvataggio** (righe 338-339), non il selettore.

### A2 — Nessun cambio grafico ✅
- Bundle live `main.f71eec1d.js` md5 **`1d9eac0582c0378b63339035e5db01a1`** = **byte-identico** al build verificato → l'aspetto è garantito immutato.
- Label presenti nel bundle: `Tel\xe9fono` (×2, l'`é` è unicode-escaped nel minified), `💬 WhatsApp`, `🏪 Barra`.
- `version.json` live → commit **cb13736**.

### A3 — Hotfix sotto al cofano ✅
`cb13736` righe 338-339:
```js
canal: canal === "BANCO" ? "BANCO" : "MANUAL",
wa_id: canal === "WA" ? String(tel || "").replace(/\D/g, "") : "",
```
→ se l'operatore seleziona "💬 WhatsApp", l'ordine è salvato **`canal=MANUAL`** (mai più `canal=WA` orfano) → **resta visibile in Pedidos/Tel**; origine WhatsApp tracciata in `wa_id` → badge "💬 WhatsApp". Fallback in `TabManual` (`belongsToPedidos`) per eventuali orfani `canal=WA` senza wa_id, con badge "💬 WA sin conversación".

### A4 — #014 (osservazione, NON toccato) ⚠️ non più attivo
`ordenes` non contiene più #014. È stato archiviato in `storico` dalla **chiusura serata notturna**:
```
storico: orden_id=#014, estado=CHIUSO_FORZATO, canal=WA, fecha=2026-06-14, hora=22:00
```
**Timeline:** #014 era `POR_CONFIRMAR` orfano durante il servizio di ieri; la chiusura serata (Madrid 22-06) l'ha messo a `CHIUSO_FORZATO` **prima** che la hotfix andasse live (deploy `cb13736` = 2026-06-15 ~07:36 UTC). Quindi **#014 non è più osservabile in Pedidos**: non è un ordine attivo, è già archiviato. Non modificato, non eliminato, non confermato — solo letto.
> Nota: la hotfix lo avrebbe reso visibile in Pedidos se fosse ancora stato attivo. La prova a runtime per gli orfani arriverà col prossimo ordine live (che la prevenzione dovrebbe evitare di creare, e che il fallback intercetterebbe comunque).

### A5 — Altri orfani attivi
`ordenes` è **vuota** (`count */0` — serata chiusa, nuovo servizio non iniziato). Query `canal=WA` su `ordenes` → **0 righe**. **Nessun orfano WA attivo** da segnalare. (Gli `canal=WA` storici in `storico` sono archivi chiusi, non rilevanti.)

---

## PARTE B — Regola per la nuova versione V1 (NOTA, nessuna modifica ora)

**Da fare SOLO nella branch V1/laboratorio, quando si riprende il lavoro UX — NON sulla production live attuale:**

- **Rimuovere il bottone "💬 WhatsApp"** dal selettore canale del Nuevo Pedido (`NuevoPedidoModal.jsx` riga 849).
- Lasciare solo: **📞 Teléfono** e **🏪 Barra**.
- Coerenza: il default `useState("TEL")` resta valido; verificare che nessun `prefill.canal === "WA"` reintroduca il canale.

**Motivo:** un ordine creato manualmente dall'operatore non deve entrare nel canale tecnico WhatsApp. I veri ordini WhatsApp arrivano dal flusso WhatsApp (webhook → `wa_msgs`/`conv` → TabWA), non dal bottone manuale.

**Relazione con la hotfix live:** sulla live cb13736 il bottone WhatsApp **resta visibile** (aspetto invariato, come richiesto) ma è reso **innocuo** (salva MANUAL+wa_id, non più orfano). In V1 il bottone va **rimosso del tutto** — la hotfix è il ponte difensivo finché V1 non elimina la fonte del problema.

---

## SAFETY — confermato
- ✅ Zero deploy · zero patch · zero DB write · zero cleanup · zero state change · zero push main.
- ✅ Production aspetto **invariato** (bundle md5 identico, selettore identico).
- ✅ #014 osservato e basta: non modificato / non eliminato / non confermato (è già `CHIUSO_FORZATO` in storico per la chiusura serata).
- ✅ `ORDINI_2026-05-23.md` non aperto.
- ℹ️ Unica scrittura su filesystem: questo report.

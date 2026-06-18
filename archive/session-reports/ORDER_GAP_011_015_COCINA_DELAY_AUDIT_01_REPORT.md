# ORDER_GAP_011_015_COCINA_DELAY_AUDIT_01 — REPORT

**Data:** 2026-06-14 ~19:35 UTC (servizio live). Orari log in UTC; Madrid = UTC+2 (CEST). I campi `hora`/`forno_out` sono già ora locale Madrid.
**Modalità:** READ-ONLY. Zero write/deploy/patch/state change/delete/cleanup. `ORDINI_2026-05-23.md` non toccato.
**Osservazione utente:** in Cocina vedeva `#011` e poi direttamente `#015`; da lì lentezza/casino percepito. Capire cosa è successo a `#012`/`#013`/`#014`.

> ⚠️ Nota metodologica: i numeri ordine `#011…#015` sono **riusati ogni giorno** (lo `storico` mostra gli stessi id su decine di date). Questo report usa **solo le righe di OGGI** (`ordenes` + log filtrati `created_at ≥ 2026-06-14`).

---

## VERDETTO: 🟢 OK — il salto #011 → #015 è spiegabile da stati/tab/ordinamento, NON da perdita dati

`#012` **non è mai sparito**: era `EN_COCINA` per ~26 minuti, ma con `forno_out 22:01` (il più tardo) è finito **in fondo alla lista Cocina**, sotto `#011` e `#015`. `#013` era già passato a `LISTO` (tab Listos). `#014` (WA) non è mai entrato in cucina (resta `POR_CONFIRMAR` in tab Tel). Nessun ordine `EN_COCINA` risulta assente per bug. Resta valido — come fragilità separata — il rischio refresh realtime descritto in `A_COCINA_TO_COCINA_VISIBILITY_AUDIT_02`, ma **non serve** per spiegare questo specifico salto.

---

## FASE 1+2 — Timeline ricostruita (oggi)

| Ordine | estado attuale | canal / tipo / zona | hora | forno_out | created | EN_COCINA (en_cocina_at) | LISTO | EN_ENTREGA | RETIRADO | note |
|---|---|---|---|---|---|---|---|---|---|---|
| **#011** | EN_COCINA | MANUAL / DOMICILIO / Q1 | 21:50 | 21:46 | 20:58:12 | 20:58:17 (+5s) | — | — | — | ancora in cucina |
| **#012** | RETIRADO | MANUAL / DOMICILIO / Q1 | **22:05** | **22:01** | 21:05:59 | 21:06:01 (+2s) | 21:32:57 | 21:33:08 | 21:33:12 | **conflicto_driver=true, retraso 23 min** |
| **#013** | RETIRADO | MANUAL / **RITIRO** | 21:25 | 21:25 | 21:13:27 | 21:13:39 (+12s) | 21:19:38 | — | 21:23:25 | pickup, niente driver |
| **#014** | **POR_CONFIRMAR** | **WA** / DOMICILIO / Q5 | 22:00 | 21:48 | 21:19:15 | **mai (null)** | — | — | — | **mai confermato → tab Tel** |
| **#015** | EN_COCINA | MANUAL / DOMICILIO / Q5 | 22:00 | 21:48 | 21:21:36 | 21:21:40 (+4s) | — | — | — | conflicto_driver=true, retraso 9 min |

*(orari created/EN_COCINA convertiti a Madrid +2h per leggibilità; i +Ns sono il gap reale create→EN_COCINA)*

### Gap misurati
- **create → EN_COCINA:** #011 +5s · #012 +2s · #013 +12s · #015 +4s → tutti pochi secondi (tempo-operatore + 1 write). #014 mai.
- **log EN_COCINA ↔ `updated_at`/`en_cocina_at`:** sub-secondo per tutti (la riga DB è scritta ~0.3s **prima** dell'insert del log). **Nessun gap >5s.** → DB istantaneo, write non in causa.
- **«gap #011 → #015»:** non è un gap di scrittura. Tra #011 (EN_COCINA 20:58) e #015 (EN_COCINA 21:21) sono passati per cucina **anche #012 (21:06) e #013 (21:13)**. Sono tutti presenti nei log; la differenza è solo **dove appaiono nella UI**.

---

## FASE 3 — Visibilità UI (codice `777ae55`, `components/cocina/TabCocina.jsx`)

- **TabCocina mostra SOLO `EN_COCINA`** (`TabCocina.jsx:152` → `.filter(o => o.estado === ORDER_STATES.EN_COCINA)`; idem `PanelCocina.jsx:71`).
  - Nasconde `POR_CONFIRMAR` ✅ (→ va in **tab Tel/Pedidos**)
  - Nasconde `LISTO` ✅ (→ va in **tab Listos**)
  - Nasconde `RETIRADO` ✅
- **Ordinamento** (`TabCocina.jsx:191-206`): **per `forno_out` (fallback `hora`) crescente**; a parità di slot 10-min, RITIRO prima di DOMICILIO. **Nessuna logica solleva gli ordini futuri.**
- Layout: `cols = w >= 768 ? 3 : 1` → **su telefono 1 colonna**, le card sono impilate verticalmente; la terza richiede scroll.

### Dove doveva apparire ciascun ordine
- **#011** (forno_out 21:46) → Cocina, **1ª posizione**.
- **#015** (forno_out 21:48) → Cocina, **2ª posizione** (subito sotto #011).
- **#012** (forno_out **22:01**) → Cocina, **3ª/ultima posizione** — è un delivery tardo (consegna 22:05) la cui pizza non esce dal forno fino alle 22:01, quindi correttamente deprioritizzato in coda. Su mobile (1 colonna) finisce **sotto la piega**.
- **#013** → era in Cocina solo 21:13→21:19, poi **`LISTO`** → spostato in **tab Listos** prima che l'utente guardasse.
- **#014** → **`POR_CONFIRMAR`** (WA mai confermato) → **tab Tel/Pedidos**, mai in Cocina.

→ Al momento dell'osservazione (dopo che #015 è entrato, ~21:21–21:32) la Cocina conteneva **#011, #015, #012** in quest'ordine. L'utente ha letto i primi due (#011, #015) e ha percepito #012 come "mancante": in realtà era la **terza card in fondo**, perché il suo `forno_out` 22:01 è il più tardo (spinto dal `conflicto_driver` +23 min).

---

## FASE 4 — Realtime / refresh

- Supabase Realtime **attivo e sano** (verificato in audit #02: join `ordenes` accettato, `postgres_changes status=ok`).
- Su evento `postgres_changes` → `loadAll()` (refetch ordenes sub-secondo).
- **Fallback poll 5s gated su `wsConnected`** (bug noto, audit #02): se il socket va zombie senza `onclose`, il poll non riparte. → fragilità reale ma **non necessaria** per spiegare questo caso: poiché la UI dell'operatore *ha* mostrato #015 (entrato 21:21), un `loadAll` è girato a ~21:21 e **avrebbe incluso anche #012** (ancora `EN_COCINA`). Quindi #012 era nei dati: la non-visione è **ordinamento/scroll**, non perdita evento.

---

## FASE 5 — Classificazione finale

| Ordine | perché non si "vedeva" in Cocina | categoria |
|---|---|---|
| **#012** | Era `EN_COCINA` ma `forno_out 22:01` (il più tardo, spinto da conflicto_driver +23 min) → **ultima card in fondo alla lista**, sotto la piega su mobile | ✅ ordinamento by-design |
| **#013** | Era `EN_COCINA` solo 21:13→21:19, poi `LISTO` → migrato in **tab Listos** | ✅ stato/tab |
| **#014** | `POR_CONFIRMAR` (WA mai confermato con «A Cocina») → **tab Tel/Pedidos** | ✅ stato/tab |

**Nessun ordine `EN_COCINA` risulta assente per tempo prolungato; nessun log mancante.** Verdetto **OK**.

### Spunto utile per l'utente
La sensazione «#011 poi #015» nasce dal fatto che **#012 è un delivery tardo (22:05)**: la Cocina lo ordina per `forno_out`, quindi resta in fondo finché non si avvicina la sua ora. Non è perso. Se serve vederlo prima, è una scelta di **ordinamento/visualizzazione** (es. mostrare un contatore "N in coda" o evidenziare i delivery futuri), non un bug.

---

## SAFETY — confermato
- ✅ Zero write DB (solo SELECT read-only).
- ✅ Zero deploy / patch / commit / push / delete / cleanup.
- ✅ Zero state change (nessun Confirmar / A Cocina / updateEstado).
- ✅ Zero ordini creati. `ORDINI_2026-05-23.md` non aperto.
- ℹ️ Unica scrittura su filesystem: questo report.

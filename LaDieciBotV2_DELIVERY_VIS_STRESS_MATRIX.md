# La Dieci Bot V2 — Delivery Visibility / Entregas Stress Matrix

Matrice operativa di stress test per il blocco
`stati ordine delivery → visibilità in TabEntregas → azioni disponibili → sicurezza driver`.

Obiettivo: nessun deploy di `TabEntregas` / filtri visibilità delivery senza
P0 verde in questa matrice.

---

## 1. Principio generale

1. **Entregas deve aiutare a pianificare**, non solo a eseguire.
   L'operatore vuole sapere "che giro sto per fare", quindi vedere anche
   ordini delivery ancora in cucina ha valore operativo.
2. **Vedere ≠ poter agire.**
   Un ordine visibile come "🔥 En cocina" non deve esporre bottoni driver
   (Salgo / Llegado / Entregado). Solo `LISTO` (o successivi) sblocca le azioni.
3. **Azioni driver abilitate solo a LISTO.**
   Prima di `LISTO` la pizza non è pronta → marcare EN_ENTREGA significa
   pizza fredda sul motorino o errore di stato.
4. **Errore preferito: nascondere troppo presto, non agire troppo presto.**
   Se in dubbio, mostra ma blocca i bottoni.

---

## 2. Stati ordine delivery da coprire

Da `CLAUDE.md` (convenzioni naming, sezione "Stati ordine"):

| Stato | Significato |
|-------|-------------|
| `NUEVO` | Appena ricevuto WhatsApp, ancora da interpretare/confermare. |
| `POR_CONFIRMAR` | In attesa di conferma operatore (era `DA_CONFIRMARE`/`DA_CONFERMARE` — rinominato 16/05). |
| `EN_COCINA` | Confermato, in lavorazione forno. |
| `LISTO` | Pizza pronta, in attesa driver. |
| `EN_ENTREGA` | Driver partito col giro. |
| `RETIRADO` | Consegnato cliente. |
| `COMPLETADO` | Stato terminale post-chiusura serata / archivio. |

Stati legacy (`COMPLETATO` italiano) — vedi CLAUDE.md "verificare se ancora usato".

---

## 3. Tabella visibilità Entregas (proposta target)

Sezioni candidato:
- **🔥 En cocina** — pianificazione, no azioni driver
- **🍕 Listos** — pronti, azioni driver attive
- **🛵 En camino** — driver partito
- **✓ Entregados (oggi)** — opzionale, lista breve fine-giornata
- **(nascosto)** — non visibile in Entregas

| Stato | Visibile? | Sezione | Dati mostrati | Bottoni attivi | Bottoni disattivi | Rischio se visibile troppo presto | Rischio se nascosto troppo a lungo |
|-------|-----------|---------|----------------|----------------|--------------------|------------------------------------|--------------------------------------|
| `NUEVO` | NO | — | — | — | — | Operatore agisce su ordine non confermato | Nessuno (TabWA copre questo stato) |
| `POR_CONFIRMAR` | NO | — | — | — | — | Driver vede ordine che potrebbe sparire | TabWA copre |
| `EN_COCINA` | **SÌ (proposta)** | 🔥 En cocina | cliente, indirizzo, zona, hora, durata ETA, note, badge "🔥 En cocina", contatore "esce alle HH:MM" (da `forno_out`) | nessuno per driver; visibili `+5` snooze (operatore) | Salgo / Llegado / Entregado | Driver schiaccia "Salgo" su pizza fredda → pizza fuori dal forno → bancone | Operatore non può pianificare il giro |
| `LISTO` | SÌ | 🍕 Listos | come sopra + tag "PRONTO" | Salgo, modifica ordine | — | Driver corre prima del previsto (basso, forno_out già passato) | Pizza fredda sul bancone in attesa |
| `EN_ENTREGA` | SÌ | 🛵 En camino | cliente, indirizzo, zona, ETA arrivo, repartidor | Llegado, Entregado, Rientrato | Salgo | Operatore segna "tornato" prematuramente | Driver non vede dove sta andando |
| `RETIRADO` | NO (o solo storico breve oggi) | ✓ Entregados (collapsable, ultimi N) | cliente, ora consegna, totale | — (read-only) | Tutti | Operatore re-agisce su ordine chiuso | Nessuno (EconomiaPage copre storico) |
| `COMPLETADO` | NO | — | — | — | Tutti | Re-action su archivio | EconomiaPage copre |

Note operative:
- Su `EN_COCINA` lo `SnoozeButton` (+5) **rimane attivo** per l'operatore — non è azione driver, è ri-pianificazione cucina. Vedi `feature_delivery_snooze_2026-05-17.md`.
- L'ordinamento dentro "🔥 En cocina" deve essere per `forno_out` ASC (più imminente in testa).
- L'ordinamento dentro "🍕 Listos" deve essere per `forno_out` ASC (chi è pronto da più tempo prima).
- L'ordinamento dentro "🛵 En camino" deve essere per `hora_salida` ASC.

---

## 4. Scenari reali

### S1 — Ordine delivery appena confermato
- Operatore conferma da TabWA → stato passa da `POR_CONFIRMAR` a `EN_COCINA`.
- **Atteso:** appare in 🔥 En cocina di TabEntregas. Bottoni driver disabilitati.
- **FAIL:** scompare da ogni tab fino al LISTO (regressione attuale dopo `2be997b`).

### S2 — Ordine in cucina, 10 minuti prima dell'uscita
- `forno_out` calcolato dal backend = `max(hora - durata_andata, driver_libero)`.
- **Atteso:** card in 🔥 En cocina mostra "esce alle 21:29" (ord. Paco Q2 21:40 dur 11).
- **FAIL:** mostra solo `hora` (consegna) → operatore non sa quando uscire pizza.

### S3 — Ordine LISTO senza repartidor assegnato
- Stato `LISTO`, `repartidor` null.
- **Atteso:** card in 🍕 Listos, bottone "Asignar repartidor" o select; "Salgo" disabilitato finché repartidor non assegnato.
- **FAIL:** "Salgo" attivo → EN_ENTREGA senza driver = log delivery monco.

### S4 — Ordine EN_ENTREGA
- Driver ha premuto Salgo.
- **Atteso:** in 🛵 En camino. Card mostra ETA arrivo cliente (`hora_salida + durata_andata`). Bottoni: Llegado, Entregado.
- **FAIL:** resta in 🍕 Listos → operatore può ri-cliccare Salgo (doppio log).

### S5 — Ordine RETIRADO
- Driver ha premuto Entregado.
- **Atteso:** scompare da Listos/En camino. Eventualmente appare in ✓ Entregados (lista breve).
- **FAIL:** resta visibile in 🛵 En camino → operatore può ri-marcare Llegado.

### S6 — Ordine tornato da LISTO a EN_COCINA
- Operatore ha riportato indietro lo stato (modifica items che richiede ricottura).
- **Atteso:** card torna in 🔥 En cocina, bottoni driver di nuovo disabilitati.
- **FAIL:** card resta in 🍕 Listos con stato `EN_COCINA` (incoerenza).

### S7 — Ordine con +5 delay (`ui_offset_min`)
- Operatore ha snoozato 5/10/15/20 minuti.
- **Atteso:** ordinamento card usa `forno_out + ui_offset_min`. Badge mostra "+5".
- **FAIL:** snooze influenza solo TabCocina, Entregas mostra ordine vecchio in testa.

### S8 — Due ordini stessa zona stesso slot
- Stesso giro, stessa zona, due card.
- **Atteso:** raggruppati visualmente o ordinati per `forno_out` ASC. Indicazione "Stesso giro" / "+1 altra pizza Q5".
- **FAIL:** card sparse, operatore non capisce che è un unico giro.

### S9 — Ordine con ETA non verificata (post ETA-04)
- `durata_andata_min = null`, `zona_lat/lon = null` (caso indirizzo manuale o resolver fallito).
- **Atteso:** card in 🔥 En cocina con badge "ETA da verificare" + "—" al posto dei minuti. Niente "30 finto".
- **FAIL:** durata=30 mostrata come reale → operatore basa pianificazione su dato fittizio.

### S10 — Ordine con indirizzo manuale (`zona_manuale=true`)
- Operatore ha forzato zona via dropdown perché resolver ha fallito.
- **Atteso:** card visibile, badge "Zona manuale", ETA fallback con warning.
- **FAIL:** card identica a un ordine geocodato bene → nessun segnale visivo della differenza.

---

## 5. Test manuali (sequenza E2E)

Per ciascuno scenario S1-S10:

1. **Crea ordine domicilio** (NuevoPedidoModal o WhatsApp simulato).
2. **Conferma in cucina** → stato `EN_COCINA`.
3. **Apri TabEntregas:**
   - L'ordine appare nella sezione "🔥 En cocina"?
   - Indirizzo, zona, ora, durata, note visibili?
   - `forno_out` mostrato chiaramente?
   - Bottoni driver (Salgo / Llegado / Entregado) **disabilitati**?
   - Snooze `+5` (operatore) **attivo**?
4. **Premi LISTO** (da TabCocina o da Entregas se bottone presente).
   - L'ordine si sposta in "🍕 Listos"?
   - Bottoni driver **attivi**?
5. **Premi Salgo** (con repartidor assegnato).
   - L'ordine va in "🛵 En camino"?
   - Bottoni Llegado/Entregado attivi, Salgo nascosto?
6. **Premi Entregado** (o Llegado + Entregado).
   - Stato `RETIRADO`.
   - L'ordine scompare da Listos/En camino.
   - Eventualmente in ✓ Entregados.
7. **Verifica DB (READ-ONLY):**
   - `hora_salida`, `hora_entrega`, `forno_out` popolati.
   - `delivery_logs` ha la riga.
8. **Verifica storico** (chiusura serata):
   - In `storico` con `estado=RETIRADO`.
   - EconomiaPage lo conta.

---

## 6. Test automatici da aggiungere

In `ladieci-app33/src/utils/` (vicino agli altri `.test.js` esistenti):

```
deliveryVisibility.test.js
```

Casi:

| # | Input ordine | Atteso |
|---|--------------|--------|
| 1 | `{tipo_consegna:DOMICILIO, estado:EN_COCINA}` | visibile=true, sezione="en_cocina", actions={salgo:false, llegado:false, entregado:false, snooze:true} |
| 2 | `{tipo_consegna:DOMICILIO, estado:LISTO}` | visibile=true, sezione="listos", actions={salgo:true} |
| 3 | `{tipo_consegna:DOMICILIO, estado:EN_ENTREGA}` | visibile=true, sezione="en_camino", actions={llegado:true, entregado:true, salgo:false} |
| 4 | `{tipo_consegna:DOMICILIO, estado:POR_CONFIRMAR}` | visibile=false |
| 5 | `{tipo_consegna:DOMICILIO, estado:NUEVO}` | visibile=false |
| 6 | `{tipo_consegna:DOMICILIO, estado:RETIRADO}` | visibile=opzionale (sezione "entregados" se mostrata), actions tutte false |
| 7 | `{tipo_consegna:RITIRO, estado:LISTO}` | visibile=false (Entregas solo DOMICILIO) |
| 8 | `{tipo_consegna:DOMICILIO, estado:LISTO, repartidor:null}` | actions={salgo:false} (richiede repartidor) |
| 9 | `{tipo_consegna:DOMICILIO, estado:EN_COCINA, durata_andata_min:null, zona_lat:null}` | warning="ETA da verificare", actions driver false |
| 10 | `{tipo_consegna:DOMICILIO, estado:EN_COCINA, zona_manuale:true}` | warning="Zona manuale" |

Plus test ordinamento:
| # | Input lista | Atteso |
|---|-------------|--------|
| 11 | 2 ordini EN_COCINA con `forno_out` 21:20 e 21:25 | ordine 21:20 prima |
| 12 | 2 ordini LISTO con `forno_out` 21:10 e 21:20 | 21:10 prima (pronto da più tempo) |
| 13 | EN_COCINA con `ui_offset_min=5` vs altro EN_COCINA stesso `forno_out` | il non-snoozato prima |

---

## 7. Patch futura consigliata (Opzione B — frontend-only)

**Scope:** modificare SOLO predicati di filtro/azioni in `ladieci-app33/src/components/TabEntregas.jsx` (e il suo helper utils se esiste).

**Cosa cambia:**
- `isVisibleInEntregas(orden)` → `true` per DOMICILIO in `EN_COCINA | LISTO | EN_ENTREGA`.
- `sezioneFor(orden)` → ramifica EN_COCINA → "en_cocina", LISTO → "listos", EN_ENTREGA → "en_camino".
- Predicati azione separati:
  - `canSalgo(orden)` → `estado === LISTO && !!repartidor`
  - `canLlegado(orden)` → `estado === EN_ENTREGA`
  - `canEntregado(orden)` → `estado === EN_ENTREGA`
- Badge "🔥 En cocina" sulle card della sezione en_cocina, niente bottoni driver.
- `SnoozeButton` resta visibile su EN_COCINA.

**Cosa NON cambia:**
- Backend Railway (nessun nuovo endpoint, nessun cambio stato).
- DB / migration.
- Schema `ordenes`.
- API shape `getOrdenes`.
- Logica `forno_out` (già autoritativa backend).

**Rischio residuo:**
- Operatore confonde card cucina con card LISTO se badge non è abbastanza visibile → mitigare con sfondo diverso (es. tinta gialla EN_COCINA vs verde LISTO).
- Card EN_COCINA + LISTO in stessa schermata aumenta densità → su mobile va valutato collapse "En cocina" di default.

---

## 8. Regole di release

**Niente deploy di `TabEntregas.jsx` o dei filtri visibilità delivery** se:

1. Almeno uno scenario S1-S10 fallisce in browser preview.
2. Tabella §3 ha una cella P0 (EN_COCINA / LISTO / EN_ENTREGA) FAIL.
3. Test automatici §6 non aggiunti o red.
4. Build CRA non verde:
   ```
   BROWSERSLIST_IGNORE_OLD_DATA=true CI=true npm --prefix ladieci-app33 run build
   ```
5. Manca verifica E2E con almeno un ordine DOMICILIO reale o simulato dall'inizio (creazione) alla fine (RETIRADO).
6. Backup remoto `backup/v2-tab-entregas-YYYY-MM-DD` non creato prima del push su `main`.

---

## Riferimenti

- Commit cambio visibilità: `2be997b` (introdotto filtro `isWaitingDriverState`/`isDriverOnTheWayState`).
- Commit fix recente: `1951a6d` (`fix show delivery orders in kitchen on entregas tab` — verifica se ha già spostato la baseline).
- Snooze: `feature_delivery_snooze_2026-05-17.md`.
- ETA matrix complementare: `LaDieciBotV2_DELIVERY_ETA_STRESS_MATRIX.md`.

STOP DOC.

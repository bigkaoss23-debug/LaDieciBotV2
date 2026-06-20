# PLANNER RULES V1 — OPERATOR TRADEOFF (spec canonica)

**Data:** 2026-06-20 · **Ambito:** La Dieci Bot V2 — Planner V1 (staging)
**Stato:** spec di prodotto + mappatura su codice reale. Frontend già allineato a gran parte; alcuni campi backend in BACKLOG (vedi §7).

> Principio guida: **il planner consiglia, non comanda. L'operatore è sempre l'ultimo decisore.**
> Il risparmio rider è informazione, i semafori sono avvisi, e solo i casi tecnicamente impossibili bloccano davvero. Esiste il fattore umano (serata moscia, poco lavoro, rider da mandare a casa, cliente che accetta, scelta del responsabile).

---

## 1. Tolleranza clienti già confermati (ordine nell'anchor/giro)

Per un ordine **già nel giro** che, per far entrare un nuovo pedido, slitterebbe:

| Ritardo vs promesso | Semaforo | Chip esempio | Significato |
|---|---|---|---|
| **0–5 min** | 🟢 verde | `+5 min` | accettabile, nessuna azione |
| **6–10 min** | 🟡 giallo | `+8 min` | attenzione operatore, di norma gestibile |
| **>10 min** | 🔴 rosso | `+12 min` | **controlla bene prima di confermare** |

**Rosso ≠ vietato.** Significa "decisione consapevole": se l'operatore decide di farlo, può farlo.

## 2. Cucina / forno_out / salida (protegge il pizzaiolo)

**Frase chiave: sotto 15 minuti dalla salida/forno_out del giro esistente, la cucina non si tocca più.**

Se mancano **< 15 min** alla salida/forno_out del giro esistente:
- non cambiare più `forno_out`; non anticipare; non ritardare;
- non rimescolare le prime comande davanti al pizzaiolo;
- il nuovo ordine si **adatta** al giro esistente;
- eventuali ritardi si assorbono sulle **consegne successive**, con semaforo.

Se mancano **> 15 min**:
- il planner può proporre piccoli aggiustamenti cucina;
- pochi minuti (idealmente ≤5, max 10 solo se ha senso), **mai mezz'ora**;
- sempre **visibile** come impatto, mai nascosto.

## 3. Risparmio rider (mostra, non bloccare)

Mostrare il risparmio come info/chip neutro: `Ahorro bajo`, `Ahorra 4 min rider`, `Ahorra 12 min rider`.
Anche se risparmia poco, l'operatore può decidere il giro unico.

❌ NON implementare `se risparmio < 5 min → blocca`.
✅ Implementare `risparmio basso` come info; decisione finale all'operatore.

## 4. Stati UI consigliati per una proposta `Usar giro Q5`

Pochi chip chiari. Esempio "buono":
`Cliente 18:54` · `Q5 +6 min` (giallo) · `Cocina estable` · `Ahorra 4 min rider` / `Ahorro bajo`

Esempio "più grave":
`Q5 +12 min` (rosso) · `Cocina bloqueada` · `Revisar`

Vietati in UI: `No recomendado` come blocco generico · `Q2 se mueve +99 min` · debug math · `oportunidad` · `prometido` · timeline duplicata.

## 5. Blocco VERO (solo casi tecnici forti)

Bloccare davvero (`blocked=true`, niente bottone di conferma) solo per:
- rider conflict impossibile;
- route impossibile (cross non viabile / dati geo mancanti);
- cucina già bloccata **e** la proposta richiede modificarla;
- dati mancanti/unsafe;
- ordine già in stato non modificabile;
- capacità impossibile (giro pieno).

Tutto il resto → **warning + semaforo + conferma operatore** (`blocked=false`, forzabile).

## 6. Esempio canonico Q2→Q5 (Q5 +6)

Cliente nuovo Q2 (pidió 16:50) entra nel giro anchor Q5 (promesso 19:00):
- salida giro **18:47** (non anticipata — anchor lock attivo);
- **Cliente 18:54** (entrega del nuovo pedido, hora da proporre);
- **Q5 19:06 (+6)** → banda 6–10 → 🟡, gestibile;
- regreso **19:23**.

UI attesa: card `Giro compatible Q5` · `Entrega cliente 18:54` · `Ruta Q2 → Q5 (sur)` · bottone ámbar `Confirmar giro compatible`. Impatto `+6` visibile in **Giros y huecos** (`Q5 19:06 +6`), non come allarme rosso. Dettaglio pulito (no debug labels).

---

## 7. Mappatura sul codice reale — implementato vs BACKLOG

Backend: `/Users/bigart/Downloads/ladieci-bot` (branch `backup/v2-route-impact-slip-guard-2026-06-14`). **NON modificato da questa spec.**

| Regola | Stato | Dove / Nota |
|---|---|---|
| §5 Blocco solo tecnico (forzabile altrove) | ✅ **Implementato** | `routeImpact.js classifyRouteImpact`: slip/durata/qualità → `no_recomendado` **`blocked:false`** (forzabile); blocchi veri solo cross / no-impact / capacità. Coerente con "rosso ≠ vietato". |
| §3 Risparmio rider NON blocca | ✅ (principio) | Nessuna regola "risparmio<X → blocca" nel codice. |
| §1 Tolleranza a bande 0–5 / 6–10 / >10 | ⚠️ **PARZIALE / BACKLOG** | Oggi: `NO_RECOMENDADO_SLIP_MIN = 15` (routeImpact.js:176) → slip ≤15 = `ajuste` (una sola banda gialla), >15 = `no_recomendado`. Manca la banda **verde 0–5** e la soglia rossa a **>10** (oggi è >15). Refinement = nuova soglia + label di banda. |
| §2 Cucina non modificabile sotto 15 min | ⚠️ **PARZIALE / DA VERIFICARE** | Esiste l'**anchor salida lock** (FIX2, `previewStrategicOpportunities` fissa la salida indietro da `anchorPromised`) e `forno_out` autoritativo (`zones.calcolaFornoOut`). Manca una guardia esplicita "se `salida/forno_out − now < 15min` → freeze totale, assorbi sulle successive". Da implementare/verificare nel motore cucina (`agentCucina`/`previewStrategicOpportunities`). |
| §3 Calcolo `riderSaving` (minuti risparmiati) | ❌ **BACKLOG (non inventare nel FE)** | Nessun `ahorro/saving/risparmio` nel backend. Serve campo backend `riderSavingMin` (giro unico vs due viaggi) → poi chip `Ahorra N min rider` / `Ahorro bajo`. **Non calcolare lato frontend** (no-invención). |
| §4 Chip `Cocina estable/bloqueada` | ❌ **BACKLOG** | Serve un campo backend `cocinaState` (stable/locked) derivato da §2; il FE oggi non ha questa info. |
| §4 Chip `Cliente HH:MM` + `Q5 +N` | ✅ **Implementato (FE)** | `PremiumPlannerPopup`: chip verde `Cliente` (`.ppp-sl-leg.is-client`) + slip ancla `+N` (`.ppp-sl-slip`, ámbar). Vedi BLOCCO A. |
| §4 No debug labels in UI | ✅ **Implementato (FE)** | `No recomendado`/`oportunidad`/`prometido`/`se mueve +N`/timeline duplicata rimossi (task `..._CLEAN_UI_FINAL` + `..._OPERATOR_CLEAN_UI_FINAL`). |

### Backlog ordinato (quando si tornerà sul backend)
1. **Bande tolleranza 0–5/6–10/>10** in `routeTimeline`/`routeImpact`: introdurre `slipBand` (green/yellow/red) con soglie 5 e 10 (additivo, non cambiare `NO_RECOMENDADO_SLIP_MIN` finché il selector dipende da esso → valutare disaccoppiare la banda UI dal blocco logico).
2. **Freeze cucina <15 min** esplicito in `previewStrategicOpportunities`/`agentCucina`: se l'anchor parte tra <15 min, vietare modifiche a `forno_out`/ordine comande, assorbire sulle successive.
3. **`riderSavingMin`** nel contract strategic (giro unico vs due viaggi) → chip informativo, mai blocco.
4. **`cocinaState`** (stable/locked) nel contract → chip `Cocina estable/bloqueada`.

> Nessuno di questi 4 è stato implementato in questo task (spec-first, come da consegna): il backend NON è stato toccato.

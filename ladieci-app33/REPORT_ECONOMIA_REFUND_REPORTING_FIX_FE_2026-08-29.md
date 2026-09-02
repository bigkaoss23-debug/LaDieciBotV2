# ECONOMÍA — REFUND REPORTING TRUTH FIX (FRONTEND)

**Data:** 2026-08-29
**Tipo:** FIX MIRATO DI MAPPATURA. Nessun redesign, nessuna nuova card.
**Baseline verificata:** FE `e7aa69a` (locale = origin = runtime) · BE `8e2a25c` · DB ledger **119**

---

## A. ROOT CAUSE, CONFERMATO NEL CODICE (non solo nella descrizione ereditata)

Il backend pubblica GIÀ due campi distinti e corretti (vedi il report BE gemello — zero modifiche lì):

```
snapshot.obligation.refunded  → rimborsi su vendite NATE in questa finestra
snapshot.receipts.refunded    → rimborsi il cui EVENTO è avvenuto in questa finestra
```

Il frontend leggeva il **primo** per il KPI "Devuelto" in **due punti**, entrambi con lo stesso bug:

| File | Riga (prima) | Bug |
|---|---|---|
| `src/components/economia/EconomiaGeneral.jsx` | 367 | `<Kpi label="Devuelto" value={money(obligation.refunded)} .../>` |
| `src/components/economia/EconomiaSnapshotPanel.jsx` | 274 | `<Metric ... label="Devuelto" value={eur(snapshot.obligation.refunded)} />` |

**Perché nessun test esistente lo aveva mai preso:** ogni fixture di test precedente (in ENTRAMBI i file) aveva `obligation.refunded` e `receipts.refunded` uguali fra loro (entrambi a 0). Il bug è invisibile finché i due campi non divergono — esattamente il caso cross-day.

---

## B. MAPPATURA PRIMA DEL FIX

| KPI schermo | Componente | Campo letto | Corretto? |
|---|---|---|---|
| Cobrado | `EconomiaGeneral` | `receipts.collected` | ✅ |
| Ventas | `EconomiaGeneral` | `obligation.gross` | ✅ (per contratto: vendita = data di origine) |
| Pendiente | `EconomiaGeneral` | `obligation.unpaid` | ✅ |
| Cobrado de más | `EconomiaGeneral` | `balance.overCollected` | ✅ |
| **Devuelto** | `EconomiaGeneral` | `obligation.refunded` | ❌ |
| Anulado | `EconomiaGeneral` | `obligation.voided` | ✅ |
| Total cobrado / Efectivo / Tarjeta / Bizum / Otros | `EconomiaSnapshotPanel` | `receipts.collected` / `receipts.byMethod.*` | ✅ |
| Ventas / Pendiente de cobro / Anulado | `EconomiaSnapshotPanel` | `obligation.*` | ✅ |
| **Devuelto** | `EconomiaSnapshotPanel` | `obligation.refunded` | ❌ |

`EconomiaPage.jsx` (Historial legacy, esplicitamente fuori perimetro) calcola anche un `totals.refunded` — verificato: è **codice morto**, calcolato ma mai renderizzato in nessun punto del file. Non toccato.

---

## C. FIX IMPLEMENTATO

**Un cambio di campo in due file, più una correzione di posizione in uno di essi:**

1. **`EconomiaGeneral.jsx:367`** — `obligation.refunded` → `receipts.refunded`. Stessa posizione, stessa etichetta "Devuelto", nessun redesign.

2. **`EconomiaSnapshotPanel.jsx`** — stesso cambio di campo, **più uno spostamento deliberato**: "Devuelto" viveva nel box "VENTAS ORIGINADAS EN EL PERÍODO" (scopo-obbligazione). Un rimborso è un movimento di denaro con il proprio istante — esattamente come i quattro campi già nel box "COBRADO EN EL PERÍODO" sopra di esso, mai come una vendita. Lasciarlo nel box sbagliato, anche dopo aver corretto il valore, avrebbe prodotto esattamente la "mescolanza obbligazione/ricezione" che questo fix esiste per eliminare — lo stesso box ha già una nota esplicita (`two-sets-note`) che insegna all'operatore che le due sezioni sono scopi diversi. **Nota onesta:** questo box specifico è oggi codice morto nell'app in produzione — `EconomiaPage.jsx` monta sempre `EconomiaSnapshotPanel` con `showEconomicWindow={false}`, che lo disattiva — quindi lo spostamento non ha impatto visibile immediato, ma corregge un difetto latente prima che torni rilevante.

Nessun'altra riga, nessun'altra card, nessun cambio di colore o di layout.

---

## D. PROVA — STESSO GIORNO

Test `EconomiaGeneral.test.js` (nuovo): pagamento 85 e rimborso 15 nello STESSO giorno (`obligation.refunded=15`, `receipts.refunded=15` — concordano). Verificato: "Cobrado" mostra 70,00 €, "Devuelto" mostra 15,00 €. Il fix non introduce alcuna divergenza dove prima non c'era.

---

## E. PROVA — CROSS-DAY (il caso che conta)

Test `EconomiaGeneral.test.js` e `EconomiaSnapshotPanel.test.js` (nuovi), forma esatta della UAT reale (#999034, Mesa 6, 2026-08-28): `obligation.refunded=0` (nessuna vendita nata nella finestra), `receipts.refunded=15` (un evento di rimborso reale è avvenuto nella finestra).

**Provato che i nuovi test sono un vero regression pin, non una tautologia:** ho isolato temporaneamente il fix sorgente (`git stash`) mantenendo i nuovi test, rieseguito la suite, e **i due test sono falliti esattamente come previsto** contro il codice pre-fix:

```
Expected pattern: /15,00\s?€/
Received string:  "Devuelto0,00 €"
```

Poi ho ripristinato il fix (`git stash pop`) e rieseguito: **tutti verdi**.

---

## F. UAT 85 / 15 / 70 — PROVA LIVE DI SOLA LETTURA

Nessuna scrittura eseguita, nessun nuovo pagamento/rimborso creato. Lettura SQL diretta su staging (2026-08-29), riproducendo la finestra che "Ayer" risolverebbe oggi per il giorno reale dell'incidente (28/08):

| Valore | Dato reale |
|---|---|
| Vendita nata nella finestra (obligation.gross) | 0,00 € |
| Pagamento efectivo nella finestra | 85,00 € |
| Rimborso efectivo nella finestra | **15,00 €** |
| Caja (netto) | 70,00 € — invariato |

Con il fix: "Devuelto" mostrerà **15,00 €**. Prima del fix mostrava **0,00 €** nonostante questo rimborso reale.

---

## G. CORREZIONE COMMERCIALE — INVARIANTE (verificato lato backend, non ri-derivato qui)

Il backend (report gemello, §D) prova esplicitamente che una correzione commerciale (Ajuste Comercial) non crea mai un rimborso finto: `receipts.refunded` resta 0 quando esiste solo una correzione, mai un evento di rimborso. Il frontend eredita questa garanzia automaticamente semplicemente leggendo il campo giusto — nessuna logica di inferenza esiste o è stata aggiunta qui.

---

## H. OVERCOLLECTED — INVARIANTE

Verificato che "Cobrado de más" (`balance.overCollected`) e "Devuelto" (ora `receipts.refunded`) restano due letture indipendenti dallo stesso oggetto backend — nessuna delle due è mai calcolata a partire dall'altra nel codice frontend. La forma UAT reale (obbligazione 60, incassato 70, rimborsato 15) produce `overCollected=10` e `refunded=15` — numeri diversi, entrambi mostrati correttamente, mai confusi.

---

## I. CLOSEOUT / CAJA

Non toccati. `EconomiaSnapshotPanel`'s Caja-facing metrica (`cashRecorded = snapshot.receipts.byMethod.efectivo`) è invariata — non era mai stata parte del bug.

---

## J. REGRESSIONE

| Suite | Risultato |
|---|---|
| `EconomiaGeneral.test.js` | 5/5 pass (3 pre-esistenti + 2 nuovi) |
| `EconomiaSnapshotPanel.test.js` | 14/14 pass (13 pre-esistenti + 1 nuovo) |
| Suite Jest completa | **145 suite / 2179 test — tutti verdi** |
| `test:standalone` | 4/4 file, invariato |
| `test:mjs` | 26/29 file — le 3 falliture sono le stesse `cocina*.static.test.mjs` pre-esistenti e documentate, non correlate |
| `check:domain-language` | OK, 361 file, nessuna nuova occorrenza |
| Build di produzione | **Non eseguibile fino in fondo in locale** — il gate `guard-env-fail-closed.js` blocca correttamente una build locale priva delle variabili staging che Netlify inietta in CI (comportamento pre-esistente, corretto, non legato a questo fix). La parte `check-domain-language` del prebuild, che ESERCITA il mio diff, è passata pulita PRIMA che il gate ambientale fermasse il resto. |

---

## K. MIGRAZIONE

# **NO** (non applicabile — nessun cambio backend).

---

## L. COMMIT LOCALE

Un commit locale in questo repo, 4 file: `EconomiaGeneral.jsx`, `EconomiaGeneral.test.js`, `EconomiaSnapshotPanel.jsx`, `EconomiaSnapshotPanel.test.js`.

---

## M. PUSH / DEPLOY

# **NON PUSHATO. NON DEPLOYATO.**

---

## N. NON TOCCATO

Pendencias frontend · scrittore Cobrar Saldo · decisione di autorizzazione rimborso · redesign Economía · Historial · canonicalizzazione dell'aggregato di sessione · riparazione Class B · debito di scala dell'orphan-scan · Refund V1 UX (Mesa) · Payment Hub · produzione.

---

ECONOMIA_REFUND_REPORTING_FIX_AWAITING_DEPLOY

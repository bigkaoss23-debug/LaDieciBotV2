# La Dieci Bot V2 — WhatsApp Review Agent

Obiettivo: creare o verificare un agente di review che migliori il bot WhatsApp usando conversazioni reali archiviate, con approvazione umana.

## Purpose

Il review agent deve leggere conversazioni bot/cliente archiviate e valutare:

- tono
- correttezza menu/prezzi
- gestione orari
- gestione handoff
- sicurezza su allergie
- delivery guardrail
- casi ambigui
- qualita' del servizio

Non deve fare auto-training cieco.

## Archive / retention

Target operativo:

- conversazioni archiviate a fine servizio/notte
- retention desiderata: 1-2 mesi
- dati utili:
  - chat cliente/bot
  - ordine collegato
  - stato finale
  - eventuale handoff operatore
  - eventuali errori o correzioni manuali

Da ispezionare:

- dove sono archiviate oggi le conversazioni
- se `conv`, `wa_msgs`, `storico` o archivio dedicato contengono abbastanza dati
- se la chiusura servizio sposta/cancella conversazioni
- dove finiscono suggerimenti/rapporti se agent esiste gia'

## Weekly review flow

1. Selezionare conversazioni archiviate dell'ultima settimana.
2. Raggruppare casi:
   - pickup corretti
   - pickup con domanda orario
   - upsell
   - delivery
   - handoff
   - errori
   - richieste strane
   - allergie
3. Valutare rispetto alle regole Basic.
4. Produrre report.
5. L'umano approva/rifiuta ogni proposta.
6. Solo dopo approvazione si modifica prompt/regole/comportamento.

## Report format

Ogni item del report dovrebbe avere:

- titolo breve
- severita'
- conversazione/esempio reale
- cosa ha fatto il bot
- perche' non va bene o perche' e' migliorabile
- correzione proposta
- effetto atteso
- necessita' di approvazione

Esempio struttura:

```text
Caso: promessa orario troppo rigida
Esempio: "Te lo llevamos a las 21:00"
Problema: in delivery il tempo deve essere approssimativo.
Correzione proposta: usare "aproximadamente a las 21:00..."
Decisione: pending approval
```

## Human approval requirement

- Nessuna modifica automatica al bot senza approvazione umana.
- Il review agent suggerisce, non decide.
- Le modifiche approvate vanno in commit separati e testabili.

## Things to inspect next

- Esiste gia' un agente `agenteMiglioramento` o simile?
- Quali tabelle usa?
- Dove salva suggerimenti?
- Esiste stato `pending/approvato/rifiutato`?
- Le conversazioni archiviate includono esempi completi?
- Il report e' leggibile dall'operatore?
- Come evitare che dati sensibili vengano copiati in report non necessari?

## Guardrail

- No blind auto-training.
- No modifica automatica prompt/regole.
- No uso di conversazioni fuori retention.
- No esposizione segreti.
- No modifica produzione senza micro-step e test.

## Stato audit e mitigazioni — 2026-05-21

### 1. Audit completati

- Audit read-only Bot IA / WhatsApp Review Agent completato con Claude.
- Deep dive completato su `REGOLE_APPRESE`, prompt WhatsApp, endpoint Bot IA, UI operativa.
- Nessuna modifica fatta durante gli audit.
- Nessun DB toccato manualmente.
- Nessun `.env` letto/modificato.

### 2. Rischi identificati

- `REGOLE_APPRESE` entra nel prompt WhatsApp tramite `agentWhatsapp.js`.
- `REGOLE_APPRESE` era trattato come blocco forte "APLICAR SIEMPRE".
- Suggerimenti approvati potevano finire nel prompt senza sanitize/cap/denylist.
- Endpoint `rigeneraSuggerimenti` / `approvaSuggerimento` erano GET mutativi.
- Se `DASHBOARD_API_KEY` mancava, gli endpoint Bot IA potevano restare fail-open.
- UI Bot IA era operativa reale ma aveva label italiane.
- `rigeneraSuggerimenti` cancella ancora i pending con `sbDelete`.
- Mancano ancora preview/diff/versioning per `REGOLE_APPRESE`.
- Una regola filtrata può risultare approvata in UI ma non entrare nel prompt, perché il micro-step 1 non ha cambiato schema/UI.

### 3. Mitigazioni applicate

**Commit `f4e4226` — `fix bot ia sanitize regole_apprese against prompt injection`**
- File: `ladieci-bot/src/agents/agenteMiglioramento.js`
- Cosa fa:
  - `sanitize()` sul testo della regola approvata
  - cap 200 caratteri
  - denylist su token pericolosi (`ignora|olvida|system|tipo_consegna|conf=|tipo=|EN_COCINA|sin operador|JSON`)
  - skip + `console.warn("[bot-ia] regola scartata", s.id)` per regole sospette
  - `sbUpsert("config", { chiave: "REGOLE_APPRESE", ... })` invariato come firma
  - nessun cambio schema / API / frontend / prompt WhatsApp

**Commit `8527994` — `fix bot ia fail closed when dashboard api key missing`**
- File: `ladieci-bot/index.js`
- Cosa fa:
  - controllo locale `requireDashboardKey(res)` sui soli endpoint Bot IA mutativi
  - se manca `DASHBOARD_API_KEY` risponde `503 { ok:false, error:"bot_ia_disabled_no_auth" }`
  - middleware globale `app.use("/api", …)` invariato
  - nessun altro endpoint toccato
  - GET resta GET in questo step

**Commit `25c6b71` — `i18n translate bot ia review panel to spanish`**
- File: `ladieci-app33/src/App.jsx`
- Cosa fa:
  - traduce in spagnolo la UI Bot IA / Suggerimenti (modal `sugModal` + `detailSug` + 5 notify)
  - solo stringhe letterali
  - nessuna logica / state / chiamata API / className cambiata

### 4. Stato attuale

- Working tree pulito dopo i commit.
- Nessun push eseguito.
- Branch `main` avanti di 78 commit rispetto a `origin/main`.
- Modulo Bot IA migliorato ma non completamente chiuso.

### 5. Debiti tecnici rimasti

Da fare in micro-step futuri:

- Rendere `REGOLE_APPRESE` "suggerimenti non vincolanti" nel prompt WhatsApp, senza spostamenti rischiosi finché non esiste golden test.
- Creare golden test su `agentWhatsapp.interpreta()` per verificare che `REGOLE_APPRESE` non possa alzare `conf`/`tipo` in modo pericoloso.
- Sostituire `sbDelete pending` in `rigeneraSuggerimenti` con stato `obsoleto`/`scartato_auto`.
- Aggiungere preview/diff prima di promuovere `REGOLE_APPRESE`.
- Aggiungere versioning / backup / rollback di `REGOLE_APPRESE`.
- Valutare POST per endpoint mutativi Bot IA.
- Valutare audit approvazione: `approvato_da`, `approvato_at`, `versione_regole`.
- Gestire meglio il caso "regola approvata ma filtrata": oggi la UI può mostrarla come applicata anche se la sanitize/denylist l'ha esclusa dal prompt.

### 6. Regola operativa futura

- Non toccare più il modulo Bot IA con patch larghe.
- Ogni modifica futura deve essere micro-step separato.
- Nessuna modifica diretta al prompt WhatsApp senza test/golden corpus.
- Nessuna modifica DB/schema senza piano e approvazione.
- Live/production intoccata.

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

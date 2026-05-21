# La Dieci Bot V2 — WhatsApp Bot Delivery Strategy

Obiettivo: definire una strategia Basic sicura per il bot WhatsApp, senza bloccarlo inutilmente e senza promettere cose troppo rigide.

## Filosofia Basic

- Il bot deve ridurre lavoro operatore sui casi semplici.
- Non deve mandare ordini direttamente in Cocina.
- Il bot crea/prepara ordine in `POR_CONFIRMAR`.
- L'operatore conferma e manda in `EN_COCINA`.
- I casi complessi vanno a operatore.
- Se il bot risponde sempre "attendi operatore", fallisce lo scopo.

## Pickup Basic attuale

Stato noto:

- Bot collegato a numero WhatsApp test.
- Capisce menu completo:
  - pizze
  - drinks
  - desserts
  - ingredienti
  - prezzi
- Capisce modifiche semplici tipo aggiunta cipolla rossa.
- Se manca orario pickup, chiede orario.
- Se manca orario, puo' includere upsell drink/dessert.
- Se cliente aggiunge drink/dessert, bot aggiorna ordine e completa.
- Ordine creato in `POR_CONFIRMAR`.
- Sopra 30 EUR Basic va manuale operatore.
- Confidence sotto circa 80% va operatore.
- Bot puo' fare handoff quando confuso o fuori limiti.

## Delivery Basic Q1 — prima versione proposta

Guardrail:

- Solo Q1.
- Max 30 EUR.
- Alta confidence.
- No allergie.
- No richieste strane.
- No pagamento speciale.
- No modifiche complesse.
- No half/half.
- Indirizzo chiaro.
- Fuori Q1 -> operatore.
- Indirizzo ambiguo/low confidence -> operatore.
- Delivery time come stima, non promessa rigida.

Wording suggerito:

```text
Perfecto, te lo llevamos aproximadamente a las 21:00. Si hubiera algún retraso, te avisamos por aquí.
```

## Problema noto da verificare

Il bot sembra poter promettere un orario in modo troppo definitivo. Serve test da zero su delivery per capire:

- se usa lo stesso pipeline delivery dell'operatore
- se controlla zona/rider/forno
- se risponde con orario rigido
- se sa usare wording approssimativo
- se sa fare handoff quando rischio alto

## Cliente noto con indirizzo salvato

Comportamento desiderato:

- se cliente ha indirizzo salvato, chiedere conferma:

```text
¿Confirmas la dirección habitual ...?
```

- se conferma, usare indirizzo salvato.
- se cambia indirizzo, geocoding/fallback normale.

## Se indirizzo manca

Da verificare:

- bot chiede indirizzo?
- bot riconosce che e' delivery ma indirizzo mancante?
- handoff se indirizzo resta ambiguo?

## From-zero test scenarios

### Pickup

1. Simple pickup completo.
2. Pickup missing time.
3. Upsell accepted: cliente aggiunge drink/dessert.
4. Ordine sopra 30 EUR.
5. Pizza ambigua.
6. Allergia.
7. Add Coca.
8. Remove pizza.
9. Modifica semplice ingrediente.
10. Half/half.

### Delivery Q1

1. Simple delivery Q1 completo.
2. Delivery Q1 missing address.
3. Delivery Q1 missing time.
4. Cliente noto con indirizzo salvato.
5. Cliente cambia indirizzo.
6. Indirizzo sporco ma risolvibile.
7. Indirizzo low confidence.
8. Delivery outside Q1.
9. Delivery Q1 sopra 30 EUR.
10. Delivery allergy.
11. Richiesta orario esatto garantito.
12. Richiesta pagamento speciale.
13. Modifica complessa.

## Handoff rules

Mandare a operatore se:

- totale > 30 EUR in Basic
- confidence < 80%
- ordine lungo/molte pizze
- half/half
- allergie
- richiesta strana/ambigua
- indirizzo ambiguo
- fuori Q1
- delivery non validato
- cliente chiede garanzia rigida su orario
- pagamento/nota speciale

## Manual delay communication

Se c'e' ritardo, l'operatore puo' messaggiare manualmente il cliente. Il bot non deve promettere garanzia assoluta se il servizio e' fluido.


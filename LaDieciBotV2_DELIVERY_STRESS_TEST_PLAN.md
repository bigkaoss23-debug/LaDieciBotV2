# La Dieci Bot V2 — Delivery Stress Test Plan

Obiettivo: validare il pipeline delivery/geocoding manuale e i fallback prima di aumentare l'automazione WhatsApp Delivery.

## Architettura operativa attuale

- L'indirizzo puo' essere inserito manualmente dall'operatore.
- I clienti frequenti/preferiti possono essere salvati e poi selezionati/autocompilati.
- I clienti occasionali one-time non devono riempire la lista preferiti.
- Se cliente/indirizzo esiste in Supabase, usare il dato salvato prima di chiamare provider esterni.
- Se non esiste, usare Google Maps/geocoding.
- Google serve per geocoding, distanza e tempo; non deve per forza essere autocomplete UI.
- I dati risolti vanno salvati in Supabase per ridurre uso futuro delle API Google.

## Fallback chain da verificare

Catena attesa o da confermare nel codice:

1. Google
2. Nominatim
3. Photon/Proton
4. Zone fallback/paracadute

Se tutti i provider esterni falliscono, usare fallback zona/manuale.

## Zone delivery

- Le zone sono 5.
- Sono disegnate manualmente per il paese e la posizione della pizzeria vicino al mare.
- Target tempo consegna: circa 15 minuti.
- Massimo operativo circa 18 minuti.
- Delivery fee attuale: 2.50 EUR fissi per tutte le zone.
- L'app aggiunge automaticamente 2.50 EUR quando viene selezionato delivery.

## Dati Supabase da verificare

Verificare, senza stampare segreti:

- cliente salvato
- telefono
- indirizzo normalizzato
- note indirizzo / interno / scala / piano separati
- lat/lng
- distanza
- durata Google
- durata Nominatim/fallback se presente
- zona
- tempo zona
- confidence
- geo cache / normalized address fields

## Matrix zone Q1-Q5

Per ogni zona:

- indirizzo pulito completo
- indirizzo con abbreviazione (`C/`, `Avda`, accenti mancanti)
- indirizzo con piano/interno
- indirizzo con numero civico ambiguo
- indirizzo noto da cliente salvato
- indirizzo nuovo
- indirizzo al bordo zona
- indirizzo fuori zona
- indirizzo non trovato

Expected:

- zona coerente
- durata coerente
- fee 2.50
- Supabase aggiornata/cachata
- UI mostra alert chiaro se fallback/manuale

## Dirty input matrix

Testare:

- `C Delfin 45`
- `C. Delfín 45 3A`
- `calle delfin 45-47`
- indirizzo senza accento
- indirizzo con virgola/localita/CAP
- indirizzo solo edificio
- indirizzo senza numero
- indirizzo con note tipo `portal 2`, `piso 4`, `bajo`
- indirizzo scritto male ma riconoscibile
- indirizzo completamente ambiguo

## Failure/fallback cases

Simulare o osservare:

- Google KO
- Google ritorna risultato distante/sbagliato
- Nominatim KO
- Photon/Proton KO
- tutti KO -> fallback zona
- provider lento
- cache esistente ma confidence bassa
- cliente salvato con indirizzo vecchio
- cliente salvato con indirizzo corretto e provider diverso

## Rider/payment cases

Vista reparto tipo Uber Eats deve mostrare:

- cliente
- telefono
- indirizzo
- pizze
- drinks
- prezzo
- zona
- orario
- ordine per zona/orario

Pagamento:

- tarjeta
- efectivo
- Bizum

Dopo pagamento/consegna:

- ordine chiuso/archiviato
- non influenza piu' Reparto
- non influenza Horno

## Mini-service stress

E' gia' stato testato un mini-servizio di circa 10 delivery e ha funzionato. Serve stress piu' strutturato:

- 10 delivery Q1-Q5 distribuiti
- 3 indirizzi sporchi
- 2 clienti salvati
- 2 nuovi clienti
- 1 fuori zona
- 1 fallback manuale
- 1 pagamento cash
- 1 tarjeta
- 1 Bizum
- 1 rollback o modifica orario

## Output atteso

Per ogni test salvare:

- input operatore
- provider usato
- zona
- durata
- confidence
- delivery fee
- UI alert/suggerimento
- stato Supabase
- eventuale fallback
- note su errore o correzione


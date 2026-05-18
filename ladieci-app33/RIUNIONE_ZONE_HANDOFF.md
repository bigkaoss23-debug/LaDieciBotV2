# Ridisegno zone consegna La Dieci — Handoff per riunione

**Pizzeria:** La Dieci — Plaza Itálica 8, 04740 Roquetas de Mar (Almería)
**Coordinate:** ~36,762° N, -2,610° W (casco antiguo / pueblo)
**Data documento:** 11 maggio 2026
**Stato:** Preparazione riunione con il proprietario su ridisegno zone delivery
**Modello usato per ricerca:** Claude Sonnet (chat con limiti di crediti — questo file serve come handoff per ripartire da un altro account)

---

## 0. Stato della conversazione fino ad ora — leggere prima di tutto

Cosa abbiamo già deciso e cosa è ancora aperto.

### Vincoli confermati dal proprietario
- **Prezzo consegna: 2,50€ fissi, uguali per tutte le zone coperte.** Non si tocca. → tutta la parte "tariffe differenziate per corona" del primo ragionamento NON si applica: il modello scelto deve funzionare a prezzo unico.
- **Driver attualmente: 1 scooter, 1 driver.**
- **Nessuno storico indirizzi salvato.** La discussione parte da urbanistica + ipotesi, non da dati reali.
- **Vincolo geografico chiave:** la pizzeria ha **le spalle al mare** (mare a SE/E). La clientela utile si distribuisce in un arco di ~180° verso N / NW / W / SW.

### Problema specifico emerso
La zona **Q1 (Centro + Buenavista)** è quella che dà più problemi. Il driver dice che, quando ha ordini dentro Q1, gli conviene "logicamente" attaccare un ordine di **un'altra zona** sulla stessa direzione, perché Q1 attuale lo costringe a un giro a Y inefficiente. Diagnosi: **Q1 attuale è in realtà due cluster diversi attaccati a una stessa etichetta** (casco antiguo a sud + Buenavista a nord).

### Cosa abbiamo proposto e validato come direzione
**Spaccare Q1 in due sotto-zone Q1a + Q1b.** Dettagli e schema sotto, sez. 8.

### Decisioni ancora aperte (da chiedere a proprietario + driver)
1. **Su quale strada esatta passa il confine vero** tra Q1a (casco) e Q1b (Buenavista)?
   - Ipotesi del documento: Calle Las Marinas / Avda. Carlos III.
   - Va confermato col driver: "Quando senti di essere passato in Buenavista, su che strada hai appena svoltato?"
2. **Buenavista 16 min / 3 ordini è realistico?** Validare col driver.
3. **Direzione abituale dei giri** a Buenavista (da sud verso nord, o opposto). Serve a capire se Q1b si abbini meglio con Q4 Cortijos (NW) o con Q3 IES (W).
4. **Aguadulce e El Parador sono dentro o fuori?** Sono i 2 nuclei popolosi non chiaramente coperti dalle 4 zone attuali. Va deciso esplicitamente.
5. **Routing cross-zona** (la possibilità del driver di abbinare ordini di zone diverse sulla stessa via): da rivedere DOPO che Q1 è spaccata.

---

## 1. Contesto pizzeria

| Voce | Valore |
|---|---|
| Indirizzo | Plaza Itálica 8, 04740 Roquetas de Mar |
| Posizione | Casco antiguo / pueblo, ~1 km a N del Faro, ~1 km a NW del Castillo de Santa Ana |
| Mare | A SE / E della pizzeria (spalle al mare) |
| Zone attuali | 4 (Q1 Centro+Buenavista, Q2 Las Marinas, Q3 IES, Q4 Cortijos) |
| Tariffa consegna | 2,50€ fissi su tutte le zone |
| Driver | 1 scooter, 1 driver |
| Capacità forno | 4 pizze ogni slot di 10 min (rolling queue 19:30-23:00) |
| Storico indirizzi clienti | **Nessuno** (da iniziare a salvare) |

---

## 2. Urbanistica Roquetas de Mar

### 2.1 Struttura del comune

Roquetas non è una città compatta: è un **arcipelago urbano** di nuclei distinti, cresciuti per epoche e ragioni diverse (pesca, agricoltura intensiva di serra, turismo costiero, espansione residenziale).

Nuclei ufficiali secondo SIMA (Junta de Andalucía):

| Nucleo | Abitanti SIMA | Profilo dominante |
|---|---:|---|
| **Roquetas de Mar (casco urbano)** | 50.415 | Capoluogo, residenziale stabile, "pueblo" — qui sta Plaza Itálica |
| **Aguadulce** | 17.724 | Costa NE, alto-medio, residenziale + turistico |
| **Campillo del Moro** | 14.051 | Espansione residenziale moderna, NE casco, popolazione stabile |
| **El Parador de las Hortichuelas** | 10.193 | Ovest interno, sull'asse A-1051 verso La Mojonera, residenziale + serra |
| **Las Marinas** | 5.076 | SW costa, urbanizzazione, fortemente stagionale |
| **Urbanización Roquetas de Mar** | 4.786 | Costa subito a S del puerto, stagionale (hotel + apt) |
| **Cortijos de Marín** | 2.931 | Periferia NW, residenziale popolare + serra |
| **El Solanillo** | 459 | Pueblo de colonización agricolo, 8 km a NW |
| Diseminados | 875 | Case isolate in zona agricola |

**Totale ufficiale (gen 2026):** 114.313 abitanti. Roquetas è il 2° comune di Almería per popolazione, e quello che cresce di più in Andalusia (+2,6% nel 2025).

### 2.2 Mappa mentale partendo da Plaza Itálica

```
                                            (NORD)
                       Cortijos de Marín ●─── ~6 km NW
                       El Solanillo (agric.) ●─── ~8 km W/NW
                                            │
                     Aguadulce (~10 km NE) ●  (autovia di mezzo)
                                          ╲ │
                                           ╲│
  El Parador ●────── ~5-8 km W ─────── ●─── ★ Plaza Itálica (casco)
  Las Lomas/Buenavista/200 Viv. (~0-2 km, urbano denso)
                                           ╱│ Faro / Castillo
                                          ╱ │
                  Urbanización Roquetas ●  │
                  Las Marinas ●            │       MARE
                  Playa Serena ●           │      (SUD-EST)
                  El Sabinar ●─── ~5-7 km SW costa

                                            (SUD)
```

Per fasce di distanza stradale dalla pizzeria:

- **< 1 km — Centro storico esteso:** Plaza de Andalucía, 200 Viviendas, Buenavista lato pueblo, calles del puerto.
- **1-2 km — Primo anello urbano:** Campillo del Moro lato sud, parte bassa di Las Marinas (Avda. Sabinar), prima fascia di Urbanización Roquetas.
- **2-4 km — Cintura costiera + retroterra:** Urbanización Roquetas, parte centrale di Las Marinas, El Sabinar nord, espansione W lungo Avda. Carlos III.
- **4-7 km — Anello esterno:** Playa Serena (SW), Cortijos de Marín (NW), El Parador (W), Campillo nord/zona IES.
- **7-12 km — Periferia agricola/turistica:** Aguadulce (NE), El Solanillo (NW), bordi serra.

### 2.3 Stagionalità — CONTA MOLTISSIMO

Roquetas è una città balneare con due stagioni di comportamento radicalmente diverso:

- **Roquetas residente (ott-mag):** ~114k stabili. Domanda di pizza viene **soprattutto da casco urbano + Campillo + 200 Viviendas + Buenavista + Aguadulce centro**. Las Marinas e Playa Serena d'inverno sono in gran parte vuote (appartamenti chiusi, pochi residenti tutto l'anno).
- **Roquetas estiva (giu-set, picco lug-ago):** ~16.500 stanze hotel + >40.000 plazas turistiche. A luglio-agosto entrano ~208.000 viaggiatori → 916.000 pernottamenti. **La fascia costiera SW (Urbanización + Las Marinas + Playa Serena) e Aguadulce esplodono.** Lo stesso indirizzo che a febbraio è chiuso, ad agosto ha una famiglia che ordina 2x a settimana.

**Implicazione operativa:** qualsiasi sistema di zone va testato su entrambi i regimi. Se a febbraio Q2 sembra "morta", non è da eliminare — è solo da non saturare con slot dedicati.

---

## 3. Distanze e tempi reali (Google Maps come riferimento)

> ⚠️ I numeri sotto sono triangolati da fonti pubbliche (Rome2Rio, ViaMichelin, distanciasentre, citypopulation.de) perché Google Maps richiede consenso cookie/login. **Riverificare a mano su Google Maps prima di scolpire qualunque tariffa o tempo dichiarato al cliente** — soprattutto i tempi sera/scooter.

| Destinazione | Distanza euclidea | Distanza stradale | Tempo auto giorno | Tempo scooter sera (stima) | Note |
|---|---:|---:|---:|---:|---|
| 200 Viviendas / Plaza Andalucía | 0,3 km | ~0,4 km | 2' | 1-2' | Quasi confinante |
| Buenavista (lato pueblo) | 0,5-1 km | 0,7-1,2 km | 3' | 2-3' | Centro residenziale |
| Campillo del Moro | 1-2 km | 1,5-2,5 km | 4-6' | 3-5' | Asse Avda. Juan Carlos I |
| Urbanización Roquetas (centro) | 1,5 km | ~2 km | 5' | 3-5' | Costa subito a S |
| Las Marinas (centro urbanización) | 3-4 km | ~5 km | 8-10' | 6-9' | Costa SW |
| Playa Serena (centro) | 3,5 km | ~4,8 km | 7-10' | 7-10' | Costa SW estrema |
| El Sabinar | 5 km | 6-7 km | 10-12' | 10-13' | SW estremo, residenziale |
| Cortijos de Marín | 4 km | ~6 km | 8-10' | 8-11' | NW interno |
| El Parador | 4-5 km | 6-8 km | 10-12' | 10-13' | W interno, sull'A-1051 |
| Las Lomas (zona) | 1-2 km | variabile | 4-6' | 3-5' | Ambiguo — confermare quale "Las Lomas" |
| El Solanillo | ~5 km | ~8 km | 12-15' | 12-16' | NW, pueblo agricolo isolato |
| **Aguadulce** | 8-9 km | **~10 km** | **~10 min** | **12-15 min** | NE, autopista in mezzo, fuori footprint logico per 1 driver |

**Distanza euclidea vs stradale:** modesta verso costa (corre rettilinea), si allarga verso NW per via di rotonde e attraversamento serra. Per Cortijos / El Solanillo / El Parador usare sempre la **stradale**.

**Tempi notte vs giorno:** d'estate lungomare Las Marinas / Playa Serena di sera può rallentare un giro del 20-30% (traffico + parcheggio). In inverno i tempi sopra sono affidabili.

---

## 4. Analisi delle 4 zone attuali

Recap della configurazione attuale:

| Zona | Etichetta | Tempo giro | Max ordini | min/ordine implicito |
|---|---|---:|---:|---:|
| Q1 | Centro + Buenavista | 15' | 4 | 3,75 |
| Q2 | Las Marinas | 18' | 2 | 9,0 |
| Q3 | IES | 12' | 5 | 2,4 |
| Q4 | Cortijos | 20' | 2 | 10,0 |

### Cosa funziona
- **Q1 Centro+Buenavista:** 4 min/ordine medi sono realistici **solo se gli indirizzi sono tutti nel casco**. Vedi sez. 8 — quando entra anche Buenavista, sfora.
- **Q4 Cortijos:** 10 min/ordine coerente con i ~6-8 km stradali e i 2 indirizzi sparsi. ✅
- **Q2 Las Marinas:** 9 min/ordine verosimile per fascia costiera SW, **finché resta dentro Las Marinas vera e propria**. Se Q2 inghiotte anche Playa Serena → cresce a 22-25'.

### Cosa NON quadra
- **Q3 IES — 5 ordini in 12 min:** è il punto più sospetto. 2 min e 24 sec a indirizzo, **incluso** andata e ritorno. Fattibile solo se i 5 indirizzi sono sullo stesso isolato. **Probabilmente sopra-promesso al cliente.** Fix: ridurre max ordini o allungare tempo dichiarato.
- **Q1 (problema principale):** è in realtà due cluster diversi (casco + Buenavista) etichettati come uno. Il driver lo sente: vorrebbe abbinare cross-zona perché il giro logico non rispetta i confini.
- **Buchi di copertura:**
  - **El Parador (10.193 ab.)** — non sembra appartenere a nessuna delle 4 zone.
  - **Aguadulce (17.724 ab.)** — stessa domanda.
  - **Campillo del Moro (14.051 ab.)** — ricade dentro Q1 o Q3?
  - **Playa Serena** — è dentro Q2 o resta scoperta?
- **Asimmetria del carico teorico:** Q3 promette 5 ordini/12 min, Q4 ne promette 2/20 min. Q3 può saturare un turno di forno, Q4 quasi mai. Esplode il primo venerdì estivo.

### Verdetto sintetico
Le 4 zone sono **ragionevoli ma incomplete**: gestiscono bene pueblo e costa SW vicina, ignorano (deliberatamente o no) buona parte del comune. Il problema non è la forma dei poligoni ma le **dichiarazioni esplicite di copertura** che mancano.

---

## 5. Vincolo aggiornato: prezzo unico a 2,50€

Il proprietario ha confermato in chat: **2,50€ fissi per tutte le zone coperte, non si differenzia.** Questo cambia il ragionamento sui modelli:

- Tutta la motivazione "corone tariffarie" (pagare di più chi sta più lontano) **non si applica**.
- Resta in piedi solo la motivazione **operativa/tempi**: il modello deve aiutare il driver a chiudere giri corti e onesti, e aiutare il sistema a non sovra-promettere tempi al cliente.
- Conseguenza: **i poligoni vincono sulle corone**, perché un poligono codifica direttamente "quanto tempo ci metto a servire questa zona", che a prezzo unico è l'unica leva rimasta.

---

## 6. Cinque modelli di gestione zone — confronto rivisto a prezzo unico

| # | Modello | Come funziona | Pro (a prezzo unico) | Contro (a prezzo unico) | Verdetto |
|---|---|---|---|---|---|
| **a** | **Più zone piccole (6-8 poligoni)** | Spezzare le 4 attuali in 6-8 micro-poligoni: Centro / Buenavista / 200 Viv / Urbanización / Las Marinas / Playa Serena / Cortijos / El Parador | Tempi giro precisi per cluster geografico reale; capienza per zona calibrata; il sistema non sovra-promette quando il driver va in un sottocluster lontano | Più configurazione; volume per zona crolla d'inverno; rischio frizione su confini | ✅ **Direzione giusta a prezzo unico.** È il modello da costruire incrementalmente, partendo dal fix di Q1 |
| **b** | **Meno zone grandi (2-3 macro)** | Es. ZONA URBANA / ZONA ESTESA / FUORI ZONA | Semplicissimo da comunicare | Sovra-promesse certe; il problema attuale di Q1 si amplifica | ❌ Peggio dell'attuale |
| **c** | **Corone concentriche (raggi)** | 0-1,5 / 1,5-3 / 3-5 km, tariffe per corona | (Decaduto col vincolo prezzo unico) | A prezzo unico le corone non aggiungono nulla che un poligono non faccia meglio | ❌ Non applicabile |
| **d** | **Raggio massimo + slot orari** | 1 cerchio "consegnamo entro X km" + sera divisa in slot 10 min | Massima semplicità per cliente; matcha bene il forno a slot (4 pizze/10 min); driver gira "a ondate" | Niente differenziazione interna: stesso slot per casco vicino e Playa Serena lontana; può rifiutare ordini quando slot pieno | 🟡 **Da abbinare a (a)**, non da usare da solo |
| **e** | **Routing dinamico (no zone)** | Algoritmo raggruppa ordini per direzione/strada in tempo reale | Massima efficienza; si adatta a stagionalità da solo; perfetto multi-driver | Richiede software serio (OptimoRoute, Routific, NextBillion) o codice custom; sovradimensionato per 1 driver | ❌ **Da rivedere tra 9-12 mesi**, quando avete dati storici e magari 2-3 driver |

### Raccomandazione operativa (a prezzo unico 2,50€)

**Modello (a) — poligoni ridisegnati, prezzo unico, capienza dichiarata per poligono.** Costruito incrementalmente:
1. **Subito:** spaccare Q1 in Q1a + Q1b (vedi sez. 8). Risolve il problema concreto segnalato dal driver.
2. **Settimana 2:** decidere esplicitamente cosa fare di Aguadulce + El Parador (in / fuori) e di Campillo (Q1a, Q3, sua zona?).
3. **Mese 2:** rivedere Q3 IES (5 ordini in 12 min è troppo ottimista).
4. **Mese 3+:** quando ci sono ~200 indirizzi salvati con lat/lng, ridisegnare i poligoni sui dati reali e non più sulle ipotesi.

In parallelo, opzionalmente, **gli slot orari del forno diventano anche slot di consegna comunicati al cliente** ("consegna nello slot 20:30") invece di tempi puntuali ("consegna in 35 min"). Questo non è un modello di zone, è un cambio di linguaggio nel bot WhatsApp.

---

## 7. Proposta operativa — riassunto

### 7.1 Adesso (questa settimana)
1. **Spaccare Q1 in Q1a + Q1b** (dettagli sez. 8).
2. **Chiarire copertura Aguadulce, El Parador, Campillo, Playa Serena** in modo esplicito (dentro o fuori, e dentro quale zona).
3. **Decidere se passare al linguaggio "slot di consegna"** invece di tempi puntuali nel bot WhatsApp.

### 7.2 In preparazione estate (giu-ago)
- **Capienza di Q2 (Las Marinas) va alzata di sera** perché si riempie.
- Se 1 solo driver non regge, è il segnale per il 2° driver.

### 7.3 Se / quando entra un 2° driver
- Niente cambia nelle zone, **ma**: Driver A = poligoni interni alta rotazione (Q1a, Q3 interno); Driver B = poligoni esterni a giri lunghi (Q1b, Q2, Q4).
- Con 2 driver in parallelo lo slot del forno torna a essere il vero collo di bottiglia.
- Con 3+ driver, **rivalutare routing dinamico** (modello e).

### 7.4 Salvare i dati indirizzo da OGGI — punto più importante per il futuro

Senza dati, ogni discussione di zone resta teorica. Servono 2 campi aggiuntivi in `ordenes` Supabase:

1. **`address_text`** — indirizzo testuale completo (già in `wa_msgs.ia_items`, va promosso).
2. **`address_lat`, `address_lng`** — coordinate geocodificate. Al momento della conferma ordine, backend chiama una volta Google Geocoding API (5$ / 1000 chiamate, marginale) o Nominatim/OSM gratis ma rate-limited.

Aggiunta a basso costo: **CP (codice postale)** — proxy povero del quartiere, utile nelle prime 4 settimane.

Con questi dati:
- 30 gg → mappa puntinata reale "da dove arrivano gli ordini".
- 60 gg → zone basate su dati, non ipotesi.
- 90 gg → "ha senso una promo Cortijos il martedì?" → risposta con grafico.
- Bonus: **tempo medio reale** per zona (verifica se i tempi giro promessi reggono).

---

## 8. PROPOSTA Q1 SPLIT — Q1a + Q1b

Questa è la parte più operativa del documento, la decisione da portare in riunione.

### 8.1 Diagnosi

Q1 attuale ("Centro + Buenavista") è in realtà **due cluster geograficamente e tipologicamente diversi**:

- **Cluster A — Casco antiguo:** attorno a Plaza Itálica / Plaza Andalucía / 200 Viviendas / faro / puerto. Raggio piccolo (~500-700 m), case basse, vie strette, citofoni veloci.
- **Cluster B — Buenavista:** urbanizzazione residenziale lungo Avda. Sabinar a nord del pueblo. Più lontana (1-2 km), palazzine moderne (citofono + magari ascensore).

Tra A e B in mezzo ci sono 600-800 m che il driver attraversa **due volte** in un giro a Y. Per questo segnala che gli converrebbe attaccare un ordine di altra zona sulla stessa direzione (verso nord) anziché chiudere Q1 prima.

### 8.2 Schema visuale (vista dall'alto, nord in alto)

```
                                    NORD ↑
                                         │
                                         │
   ╔═════════════════════════════════════════════════════════════════╗
   ║                                                                 ║
   ║                    ★ Q1b — BUENAVISTA                           ║
   ║                                                                 ║
   ║       ▪ Buenavista       ▪ Residencial Sabinar 200              ║
   ║       ▪ Avda. Sabinar (parte alta)                              ║
   ║       ▪ Calles Brasil, Cuba, Buenos Aires, Bolivia              ║
   ║                                                                 ║
   ║       Distanze: 1,0 - 1,8 km dalla pizzeria                     ║
   ║       Tipologia: palazzine residenziali moderne                 ║
   ║                                                                 ║
   ╠══════════════════ Calle Las Marinas / Avda. Carlos III ═════════╣ ← confine
   ║                          (DA CONFERMARE col driver)             ║
   ║                                                                 ║
   ║                    ★ Q1a — CASCO ANTIGUO                        ║
   ║                                                                 ║
   ║       ▪ 200 Viviendas / Plaza de Andalucía                      ║
   ║                                                                 ║
   ║                  🍕 PIZZERIA (Plaza Itálica 8)                  ║──→ MARE
   ║                                                                 ║   (est/SE)
   ║       ▪ Casco antiguo / pueblo storico                          ║
   ║       ▪ Puerto deportivo                                        ║
   ║       ▪ Castillo de Santa Ana / Faro                            ║
   ║                                                                 ║
   ║       Distanze: 0 - 0,7 km dalla pizzeria                       ║
   ║       Tipologia: case basse, vie strette, citofoni veloci       ║
   ║                                                                 ║
   ╚═════════════════════════════════════════════════════════════════╝
                                         │
                                         │
                                    SUD ↓ (mare)
```

**Legenda mentale:**
- La pizzeria sta sul **bordo inferiore** di Q1a (vicino alla costa).
- Q1a è piccolo e compatto, tutto raggiungibile in 1-2 minuti di scooter.
- Q1b sta sopra Q1a, unico modo per arrivarci è passare attraverso il pueblo.
- A E/SE c'è il mare → niente clienti → niente zona.
- A W e NW, oltre Q1b, comincia il territorio di Q3 (IES) e Q4 (Cortijos).

### 8.3 Stima tempi smontati per pezzo

Tempo di un giro = **andata + N consegne + ritorno**. Ogni consegna stimata ~1-2 min (citofono, attesa cliente, eventuale resto, ripartenza).

#### Q1a — Casco antiguo

| Componente | Tempo |
|---|---:|
| Andata pizzeria → primo indirizzo (max 700 m) | 1-2 min |
| Consegna #1 | 1,5 min |
| Spostamento al #2 (vie adiacenti) | 1 min |
| Consegna #2 | 1,5 min |
| Spostamento al #3 | 1 min |
| Consegna #3 | 1,5 min |
| Ritorno alla pizzeria | 1-2 min |
| **Totale giro pieno (3 ordini)** | **~10 min** |
| Giro con 2 ordini | ~7 min |
| Giro con 1 ordine | ~4-5 min |

**Capienza proposta:** 3 ordini / 10 min.

#### Q1b — Buenavista

| Componente | Tempo |
|---|---:|
| Andata pizzeria → primo indirizzo Buenavista (~1,2-1,5 km) | 3-4 min |
| Consegna #1 | 2 min (palazzine, citofono + magari ascensore) |
| Spostamento al #2 (urbanizzazione, vie larghe) | 1-1,5 min |
| Consegna #2 | 2 min |
| Spostamento al #3 | 1-1,5 min |
| Consegna #3 | 2 min |
| Ritorno alla pizzeria | 3-4 min |
| **Totale giro pieno (3 ordini)** | **~16 min** |
| Giro con 2 ordini | ~12 min |
| Giro con 1 ordine | ~8-9 min |

**Capienza proposta:** 3 ordini / 16 min.

> ⚠️ Nota onesta: 16 min per 3 ordini di Buenavista è **più dei 15 min che oggi date per tutto Q1**. Questo è esattamente il sintomo del fatto che Q1 attuale è sovra-promesso quando il driver finisce a Buenavista. Il numero da rivedere col driver.

### 8.4 Confronto Q1 attuale vs Q1a + Q1b nuovi

| Metrica | Q1 oggi | Q1a nuovo | Q1b nuovo |
|---|---:|---:|---:|
| Tempo giro dichiarato | 15 min | **10 min** | **16 min** |
| Max ordini | 4 | 3 | 3 |
| Distanza max | "centro+buena" mischiato | 700 m | 1,8 km |
| Realismo dei tempi | sovra-promesso se va a B | ✅ | ✅ |
| Frizione driver "mi conviene mischiare" | alta | bassa | bassa (se mischia con Q4 a nord, è ora una scelta razionale e dichiarabile) |

Capienza totale "ex Q1" passa da 4 → 6, ma **il forno è ancora a 4 pizze/10 min**, quindi questo limite non si raggiunge mai in parallelo. Significa solo che potete avere 3 ordini in slot 20:00 + 3 ordini in slot 20:10 senza che il sistema dica "Q1 pieno".

### 8.5 Domande per il driver / proprietario prima di disegnare i confini definitivi

1. **Su quale strada esatta passa il confine?** Ipotesi: Calle Las Marinas / Avda. Carlos III. Vera domanda al driver: *"Quando esci dal casco e senti di essere a Buenavista, su che strada hai appena svoltato?"*
2. **Buenavista 16 min / 3 ordini ti suona?** Se dice "no, 3 lì non li chiudo in meno di 20", alziamo. Se dice "ne faccio 3 in 12", abbassiamo.
3. **Direzione abituale dei giri a Buenavista**? Da sud verso nord, o opposto? Decide se Q1b si abbina naturalmente con Q4 Cortijos (NW) o con Q3 IES (W).

---

## 9. Tre domande chiave da fare al proprietario in riunione

1. **Aguadulce e El Parador sono dentro o fuori?** Sono i due nuclei più popolosi non chiaramente coperti dalle 4 zone attuali (17.724 e 10.193 ab.). Una scelta esplicita "no Aguadulce, no El Parador" è legittima, ma deve essere una **scelta dichiarata**, non un equivoco.

2. **Il prezzo unico 2,50€ copre davvero il costo del giro Q4/Cortijos?** Senza distanze tariffate, sui giri lunghi state mediando un margine. Domanda: il costo medio di un giro Q4 è 2,50€, o è 4-5€? Se è 4-5€, vale la pena tenere Q4 attiva (volume?) o vale la pena restringere il poligono?

3. **Vuoi vendere "slot di consegna" (es. consegna nello slot 20:30) invece di tempi puntuali (consegna in 35 min)?** È un cambio culturale grande, non tecnico. Se sì, il sistema diventa lineare e onesto e il forno smette di essere il punto di fallimento delle promesse. Se no, va bene, ma sappi che il forno resta il punto debole della comunicazione cliente.

---

## 10. Stato tecnico dell'app (per riprendere la conversazione)

Riassunto sintetico dall'architettura del progetto, utile a chi riprende il filo:

- **Frontend React:** `/Users/bigart/Downloads/ladieci-app33`, deploy Netlify (sito `magnificent-lollipop-6dff70.netlify.app`).
- **Backend Node.js:** `/Users/bigart/Downloads/ladieci-bot`, deploy Railway (`ladiecibot-production.up.railway.app`).
- **Database:** Supabase (`wnswassgfuuivmfwjxsf.supabase.co`).
- **Tabelle Supabase rilevanti per il futuro lavoro zone:**
  - `ordenes` — qui andranno aggiunti `address_text`, `address_lat`, `address_lng`, `cp`.
  - `wa_msgs.ia_items` — fonte attuale dell'indirizzo testuale (`sub` campo per note/variazioni cliente).
- **Definizione zone attualmente:** in config (Q1-Q4), poligoni KML disegnati a mano dal proprietario.
- **Regola dura:** **mai usare localStorage** (app usata da più operatori sullo stesso browser).
- **Regola dura:** **niente deploy senza permesso esplicito** dell'utente.

---

## 11. Fonti consultate

- [SIMA — Nuclei di popolazione Roquetas de Mar (Junta de Andalucía)](https://www.juntadeandalucia.es/institutodeestadisticaycartografia/sima/nucleos.htm?CodMuni=04079)
- [Popolazione ufficiale Roquetas de Mar gen 2026](https://www.roquetasdemar.es/noticias/aprobada-la-cifra-oficial-de-poblacion-de-roquetas-de-mar-1-de-enero-de-2026)
- [La Voz de Almería — Roquetas supera 114.000 residenti](https://www.lavozdealmeria.com/provincia/roquetas-de-mar/505036/roquetas-techo-supera-114-000-vecinos-consolida-municipio-andaluz-crece.html)
- [Roquetas 5° destinazione Andalusia per pernottamenti](https://www.almerianoticias.es/roquetas-de-mar-se-situa-como-quinto-destino-de-andalucia-en-pernoctaciones-durante-la-temporada-alta/)
- [Ayuntamiento — Plano urbanizaciones (PDF, mappa ufficiale)](https://www.turismoroquetasdemar.es/wp-content/uploads/2018/05/Plano-Urba-A3-MAYO2018.pdf)
- [Ayuntamiento — Plano Roquetas A3 (PDF, mappa pueblo)](https://www.turismoroquetasdemar.es/wp-content/uploads/2018/05/Plano-Roquetas-A3-MAYO2018.pdf)
- [Wikipedia — El Parador de las Hortichuelas](https://es.wikipedia.org/wiki/El_Parador_de_las_Hortichuelas)
- [Wikipedia — El Solanillo](https://es.wikipedia.org/wiki/El_Solanillo)
- [Mapcarta — Cortijos de Marín](https://mapcarta.com/N335702375)
- [citypopulation.de — Roquetas de Mar](https://www.citypopulation.de/es/spain/andalucia/almer%C3%ADa/04079__roquetas_de_mar/)
- [Ecología factorial Roquetas de Mar (UB, 200 Viviendas)](https://www.ub.edu/geocrit/sn/sn-219.htm)
- [Rome2Rio — Roquetas / Aguadulce](https://www.rome2rio.com/es/s/Roquetas-de-Mar/Aguadulce-Espa%C3%B1a)
- [Rome2Rio — Roquetas / Playa Serena](https://www.rome2rio.com/es/s/Roquetas-de-Mar/Playa-Serena-Espa%C3%B1a)
- [RadiusMapper — Delivery zone polygons vs rings](https://radiusmapper.com/blog/delivery-zone-planning-optimization)
- [Uber Merchants — Come funzionano le delivery zones](https://help.uber.com/merchants-and-restaurants/article/how-do-delivery-zones-work?nodeId=d27ee1ee-6c10-4aa4-bf11-54f0566e1392)
- [OR Spectrum — Dynamic service area sizing in urban delivery](https://link.springer.com/article/10.1007/s00291-022-00666-z)

---

## 12. Per chi riprende la conversazione in un'altra chat

**Cosa è chiuso e non va più rimesso in discussione:**
- Prezzo unico 2,50€ per tutte le zone coperte.
- Direzione: poligoni ridisegnati (modello a), non corone (modello c).
- Q1 va spaccato in Q1a (casco) + Q1b (Buenavista). Schema e tempi in sez. 8.

**Cosa serve per chiudere il design di Q1:**
1. Conferma del driver sulla strada di confine esatta.
2. Conferma del driver sulla stima 16 min / 3 ordini per Q1b.
3. Direzione dei giri abituali a Buenavista.

**Prossimi passi dopo Q1:**
- Decidere copertura Aguadulce / El Parador / Campillo / Playa Serena (sez. 7.1).
- Rivedere Q3 IES (sovra-promesso a 5 ordini / 12 min).
- Iniziare a salvare `address_lat`/`address_lng` in `ordenes` (sez. 7.4).
- Valutare passaggio a "slot di consegna" come linguaggio del bot WhatsApp.

**Cosa NON fare:**
- Non deployare niente senza permesso esplicito.
- Non scrivere su `storico` dal frontend (solo backend Railway).
- Non usare `localStorage`.
- Non riproporre tariffe per corona (vincolo confermato: prezzo unico).

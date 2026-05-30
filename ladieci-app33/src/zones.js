// Zone delivery La Dieci — Roquetas de Mar
// Poligoni reali dal KML del proprietario (Google My Maps)
// Aggiornato 11-mag-2026: 5 zone ufficiali, allineate al backend ladieci-bot/src/utils/zones.js

import {
  proposeForNewOrder as coreProposeForNewOrder,
  risolviTempoAndata as coreRisolviTempoAndata,
  simulateDriverSchedule as coreSimulateDriverSchedule,
  tempoAndata as coreTempoAndata,
} from "./core/delivery/scheduling";
import {
  BUFFER_OPS_DRIVER_MIN,
  RISTORANTE_LAT,
  RISTORANTE_LON,
  calcolaTempoGiro,
  haversineKm,
  pointInPolygon,
} from "./core/delivery/geo";
import {
  DELIVERY_ZONES,
  KEYWORDS_ZONA,
} from "./core/delivery/zonesData";
import {
  ORDER_STATES,
  isCompletedState,
} from "./core/orders";

export {
  BUFFER_OPS_DRIVER_MIN,
  RISTORANTE_LAT,
  RISTORANTE_LON,
  calcolaTempoGiro,
  haversineKm,
};

const ZONE_VISUALS = {
  Q1: { nomeBreve: "CENTRO", colore: "#0097A7", coloreSfondo: "#0097A71A" },
  Q2: { nomeBreve: "BUENAVISTA", colore: "#CE93D8", coloreSfondo: "#CE93D81A" },
  Q3: { nomeBreve: "IES", colore: "#E65100", coloreSfondo: "#E651001A" },
  Q4: { nomeBreve: "CORTIJOS", colore: "#C2185B", coloreSfondo: "#C2185B1A" },
  Q5: { nomeBreve: "MARINAS", colore: "#7CB342", coloreSfondo: "#7CB3421A" },
};

export const ZONE_DELIVERY = DELIVERY_ZONES.map(z => ({
  ...z,
  ...(ZONE_VISUALS[z.id] || {}),
}));

// ─── Calcolo tempi reali da geolocalizzazione ────────────────────────────────
// Copia 1:1 di ladieci-bot/src/utils/zones.js. Tenere sincronizzati i due file.
// Le costanti (RISTORANTE_LAT/LON, ROAD_FACTOR, CAR_KMH) sono calibrate su misure
// reali Google Maps con tragitti in MACCHINA (~17-22 km/h urbano + soste/parcheggio).

// Calcola tempo giro (minuti) — andata sola, dalla distanza ristorante→cliente.
// Convenzione coerente con backend: il "tempoGiro" è il tempo ANDATA (one-way).
// Round trip totale del driver = 2 × tempoGiro.
// Cap: non supera mai zonaFallback.tempoGiro (ottimizza, non penalizza).
// Fallback: se lat/lon mancano ritorna zonaFallback.tempoGiro (o 20 di default).
// BUFFER operativo driver al cliente (parcheggio + citofono + scale + handoff).
// Una sola costante esposta — non sommare in altri punti.
// Modello:
//   hora_promessa_cliente = forno_out + guida_pura + BUFFER_OPS_DRIVER_MIN
//   round_trip_driver    = guida_pura + BUFFER_OPS_DRIVER_MIN + guida_pura

// ─── Helper tempo andata per un ordine ────────────────────────────────────────
// Ritorna l'andata one-way (pizzeria→cliente) in minuti, scegliendo la fonte migliore:
//   1. durata_andata_min snapshot su `ordenes` (Google se cliente in Roquetas, altrimenti Haversine)
//   2. Fallback Haversine puro da lat/lon
//   3. Ultima spiaggia: zonaObj.tempoGiro (storico, può includere margini)
//
// Uso operativo (cucina, repartidor):
//   horaUscitaForno = horaConsegnaCliente - tempoAndata(ordine, zona)
// La pizza esce dal forno quando il driver è pronto a partire.
// Il margine di cottura è gestito a monte dal sistema slot/carico forno
// (vedi NuevoPedidoModal: baseMin + 5 + andata, getCaricoForno con slot10).
// SORGENTE UNICA del tempo andata one-way (pizzeria→cliente), in minuti.
// Cascata a 3 gradini, identica in ogni punto del codice:
//   1. durataAndataMin → snapshot Google se disponibile
//   2. Haversine(lat,lon) via calcolaTempoGiro → quando ci sono le coordinate
//   3. zonaObj.tempoGiro → ultima spiaggia, nessuna coordinata
// Ogni call-site che ragiona su un indirizzo specifico DEVE passare di qui:
// niente più `?? zona.tempoGiro` o `?? calcolaTempoGiro(...)` sparsi (saltavano
// gradini diversi → preventivi incoerenti, vedi bug 16/05/2026).
export function risolviTempoAndata(durataAndataMin, lat, lon, zonaObj) {
  return coreRisolviTempoAndata(durataAndataMin, lat, lon, zonaObj, calcolaTempoGiro);
}

// Guscio per la shape "ordine" (campi durata_andata_min/zona_lat/zona_lon).
export function tempoAndata(o, zonaObj) {
  return coreTempoAndata(o, zonaObj, calcolaTempoGiro);
}

// ─── Simulazione schedule del driver ──────────────────────────────────────────
// Dato un set di ordini delivery esistenti, simula in sequenza la giornata del
// driver per stabilire QUANDO il driver sarà davvero libero e QUANDO arrivano
// realmente le pizze (potrebbe essere DOPO l'hora promessa se ci sono cascade).
//
// Aggregazione same-zone-slot: ordini nella stessa zona e stesso slot10 vanno
// in UN solo giro (driver consegna più pizze nello stesso trip), fino a
// `maxOrdiniPerGiro` della zona.
//
// Input:
//   orders: array { hora: "HH:MM", zona: "Q1"…, zona_lat?, zona_lon?, items? }
//   options: { startTime?: "HH:MM" – tempo da cui parte la simulazione, default 00:00 }
// Output:
//   {
//     giri: [ { zona, hora, slot, count, pizze, tg, partenzaMin, consegnaMin, rientroMin } ],
//     driverLiberoMin: numero (minuti dalla mezzanotte) dopo l'ultimo rientro
//   }
//
// `partenzaMin`, `consegnaMin`, `rientroMin` sono tempi REALI cascadeati.
// `consegnaMin > hora` indica che l'ordine è in ritardo rispetto alla hora promessa.
export function simulateDriverSchedule(orders, options = {}) {
  return coreSimulateDriverSchedule(orders, options, {
    zoneDelivery: ZONE_DELIVERY,
    bufferOpsDriverMin: BUFFER_OPS_DRIVER_MIN,
    calcolaTempoGiroFn: calcolaTempoGiro,
  });
}

// ─── Proposta per un nuovo ordine ─────────────────────────────────────────────
// Inserisce newOrder nello schedule cascade-aware e ritorna se è OK alla hora
// richiesta oppure la prima consegna realmente possibile.
//
// Logica aggregazione: se esiste già un giro stessa zona stesso slot10(hora_new)
// con spazio (< maxOrdiniPerGiro), il nuovo ordine si unisce a quel giro
// (consegna garantita all'hora del giro esistente, niente costo extra driver).
//
// Output:
//   {
//     ok: bool,
//     consegnaPropostaMin: number,
//     consegnaPropostaH: "HH:MM",
//     motivo: string | null,
//     aggregato: bool,  // true se si unisce a giro esistente same-zone-slot
//     giroEsistente: {hora, count} | null,  // se aggregato
//     driverLiberoMin: number,  // dopo simulazione ordini esistenti
//     sim: {...}  // dettaglio schedule per debugging
//   }
export function proposeForNewOrder(orders, newOrder, options = {}) {
  return coreProposeForNewOrder(orders, newOrder, options, {
    zoneDelivery: ZONE_DELIVERY,
    bufferOpsDriverMin: BUFFER_OPS_DRIVER_MIN,
    calcolaTempoGiroFn: calcolaTempoGiro,
  });
}

// Assegna zona da coordinate — null se fuori da tutte le zone
export function assegnaZonaDaCoord(lat, lon) {
  for (const zona of ZONE_DELIVERY) {
    if (pointInPolygon([lon, lat], zona.polygon)) return zona;
  }
  return null;
}

// Keyword fallback minimo — usato SOLO se Nominatim + Photon falliscono.
// Volutamente non esaustivo: c'è già geo_cache + 2 geocoder + override manuale operatore.
// "200 viviendas" NON è tag intenzionalmente — barrio sensibile, l'operatore decide caso per caso.
export function assegnaZonaDaKeyword(indirizzo) {
  const lower = indirizzo.toLowerCase();
  for (const [id, keywords] of Object.entries(KEYWORDS_ZONA)) {
    if (keywords.some(k => lower.includes(k))) {
      return ZONE_DELIVERY.find(z => z.id === id) || null;
    }
  }
  return null;
}

// Geocodifica + assegna zona — restituisce { zona, lat, lon, metodo, displayName }
// metodo: "polygon" | "keyword" | null
// Pipeline: Nominatim (con civico) → Nominatim (senza civico) → Photon → keyword
export async function geocodificaEAssegnaZona(indirizzo) {
  if (!indirizzo || indirizzo.trim().length < 5) return { zona: null, lat: null, lon: null, metodo: null, displayName: null };

  const headers = { "Accept-Language": "es", "User-Agent": "LaDieciApp/1.0 (pizzeria-orders)" };
  const indirizzoTrim = indirizzo.trim();
  const indirizzoBase = indirizzoTrim.replace(/\s+\d+\s*$/, "").trim();

  // ── 1+2. Nominatim (con e senza numero civico) ─────────────────────────
  try {
    const q1 = encodeURIComponent(indirizzoTrim + ", Roquetas de Mar");
    const r1 = await fetch(`https://nominatim.openstreetmap.org/search?q=${q1}&format=json&limit=1`, { headers });
    if (r1.ok) {
      const d1 = await r1.json();
      if (d1 && d1.length > 0) return _assegnaDaCoord(d1[0], indirizzo);
    }

    if (indirizzoBase !== indirizzoTrim && indirizzoBase.length >= 4) {
      const q2 = encodeURIComponent(indirizzoBase + ", Roquetas de Mar");
      const r2 = await fetch(`https://nominatim.openstreetmap.org/search?q=${q2}&format=json&limit=1`, { headers });
      if (r2.ok) {
        const d2 = await r2.json();
        if (d2 && d2.length > 0) return _assegnaDaCoord(d2[0], indirizzo);
      }
    }
  } catch (_) { /* Nominatim down → procede a Photon */ }

  // ── 3. Photon fallback (più tollerante a typo OSM tipo "Dioniso" vs "Dionisio") ─
  // bbox limita i risultati all'area di Roquetas de Mar (lon_min,lat_min,lon_max,lat_max)
  try {
    const q3 = encodeURIComponent(indirizzoBase);
    const bbox = "-2.67,36.72,-2.59,36.79";
    const r3 = await fetch(`https://photon.komoot.io/api/?q=${q3}&limit=5&bbox=${bbox}`);
    if (r3.ok) {
      const d3 = await r3.json();
      const hit = (d3?.features || []).find(f =>
        (f.properties?.city || "").toLowerCase().includes("roquetas")
      );
      if (hit?.geometry?.coordinates) {
        const [lon, lat] = hit.geometry.coordinates;
        const displayName = [hit.properties?.name, hit.properties?.city].filter(Boolean).join(", ") || null;
        const zona = assegnaZonaDaCoord(lat, lon);
        if (zona) return { zona, lat, lon, metodo: "polygon", displayName };
        const zonaKw = assegnaZonaDaKeyword(indirizzo);
        return { zona: zonaKw, lat, lon, metodo: zonaKw ? "keyword" : null, displayName };
      }
    }
  } catch (_) { /* Photon down → procede a keyword */ }

  // ── 4. Keyword (ultimo fallback) ───────────────────────────────────────
  const zonaKw = assegnaZonaDaKeyword(indirizzo);
  return { zona: zonaKw, lat: null, lon: null, metodo: zonaKw ? "keyword" : null, displayName: null };
}

function _assegnaDaCoord(nomRow, indirizzoOriginale) {
  const lat = parseFloat(nomRow.lat);
  const lon = parseFloat(nomRow.lon);
  const displayName = nomRow.display_name || null;
  const zona = assegnaZonaDaCoord(lat, lon);
  if (zona) return { zona, lat, lon, metodo: "polygon", displayName };
  const zonaKw = assegnaZonaDaKeyword(indirizzoOriginale);
  return { zona: zonaKw, lat, lon, metodo: zonaKw ? "keyword" : null, displayName };
}

// Trova lo slot orario migliore per una zona.
// Cerca slot caldi (zona stessa) che siano ANCORA UTILIZZABILI:
//   - forno (= slot - tempoGiro) >= ora corrente + 5min  → c'è ancora tempo per cucinare
//   - count < maxOrdiniPerGiro                            → c'è ancora posto nel giro
// Raggruppa per slot 10-min (così ordini con hora 21:25 e 21:30 finiscono nello stesso slot 21:30).
// Tra gli slot utilizzabili, ritorna il PIÙ IMMINENTE (non il più popolato).
// Se nessuno è utilizzabile, ritorna null → il chiamante calcola un nuovo slot fresco.
export function suggerisciOrario(zonaId, ordenes) {
  if (!zonaId || !Array.isArray(ordenes)) return null;
  const zona = ZONE_DELIVERY.find(z => z.id === zonaId);
  if (!zona) return null;

  const now = new Date();
  const oraCorrente = now.getHours() * 60 + now.getMinutes();
  const limite = oraCorrente + 120; // prossime 2 ore

  // Raggruppa ordini per slot 10-min nella stessa zona (allineato al successivo multiplo di 10)
  const slotCount = {};
  for (const o of ordenes) {
    if (o.tipo_consegna !== "DOMICILIO") continue;
    if (o.zona !== zonaId) continue;
    if (isCompletedState(o.estado) || o.estado === ORDER_STATES.POR_CONFIRMAR) continue;
    if (!o.hora) continue;
    const [h, m] = o.hora.split(":").map(Number);
    const slotMin = Math.ceil((h * 60 + m) / 10) * 10;
    if (slotMin >= oraCorrente && slotMin <= limite) {
      slotCount[slotMin] = (slotCount[slotMin] || 0) + 1;
    }
  }

  // Filtra solo slot ancora utilizzabili: forno futuro AND non pieni
  // Guard temporale (Bug Z2, 17/05/2026): suggerisci SOLO slot entro 60 min
  // dall'ora corrente. Senza questo, un ordine con hora sbagliata 3 ore avanti
  // diventava "ancora di aggregazione" per tutti i nuovi ordini della stessa
  // zona, amplificando l'errore originale a tutta la coda Q-x della serata.
  const utilizzabili = Object.entries(slotCount)
    .map(([s, c]) => ({ slotMin: parseInt(s, 10), count: c }))
    // zona.tempoGiro (non risolviTempoAndata): qui si ragiona a livello slot/zona,
    // non su un indirizzo singolo → la costante zona è il gate conservativo giusto.
    .filter(({ slotMin, count }) =>
      slotMin - zona.tempoGiro >= oraCorrente + 5 &&
      slotMin <= oraCorrente + 60 &&
      count < zona.maxOrdiniPerGiro
    )
    .sort((a, b) => a.slotMin - b.slotMin); // più imminente prima

  if (utilizzabili.length === 0) return null;

  const best = utilizzabili[0];
  const orario = `${String(Math.floor(best.slotMin/60)%24).padStart(2,"0")}:${String(best.slotMin%60).padStart(2,"0")}`;
  return { orario, nOrdini: best.count };
}

// Badge zona — stile consistente in tutta l'app
export function zonaBadgeStyle(zona) {
  if (!zona) return null;
  return {
    background: zona.colore,
    border: `2px solid ${zona.colore}`,
    color: "#fff",
    borderRadius: 8,
    padding: "3px 10px",
    fontSize: 13,
    fontWeight: 900,
    display: "inline-block",
    letterSpacing: 0.5,
    boxShadow: `0 2px 8px ${zona.colore}66`,
    textShadow: "0 1px 2px rgba(0,0,0,0.3)",
  };
}

// ZonaBadge — pillola rettangolare con codice sopra (Q1) + nome sotto (CENTRO).
// Uso preferito su tutta l'app per dare contesto all'operatore (i nomi sono più
// memorizzabili dei codici). Il colore resta l'ancora visiva primaria.
//
// size:
//   "sm" — card compatte (TabListos, OrdenCard)
//   "md" — default, popup/dialog/header
//   "lg" — header zona/blocchi grandi
//
// onlyCode / onlyName: per casi speciali (riepilogo pillole, header testuali)
export function ZonaBadge({ zona, size = "md", onlyCode = false, onlyName = false, style }) {
  if (!zona) return null;
  const sizes = {
    sm: { codeSize: 11, nameSize: 8,  pad: "3px 9px",   gap: 1 },
    md: { codeSize: 13, nameSize: 9,  pad: "4px 12px",  gap: 2 },
    lg: { codeSize: 16, nameSize: 11, pad: "6px 16px",  gap: 3 },
  };
  const s = sizes[size] || sizes.md;
  const nome = (zona.nomeBreve || zona.nome || "").toUpperCase();
  const showCode = !onlyName;
  const showName = !onlyCode && nome;
  return (
    <span style={{
      background: zona.colore,
      border: `1.5px solid ${zona.colore}`,
      color: "#fff",
      borderRadius: 8,
      padding: s.pad,
      display: "inline-flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      lineHeight: 1,
      boxShadow: `0 2px 8px ${zona.colore}55`,
      textShadow: "0 1px 2px rgba(0,0,0,0.3)",
      verticalAlign: "middle",
      flexShrink: 0,
      ...style,
    }}>
      {showCode && (
        <span style={{ fontSize: s.codeSize, fontWeight: 900, letterSpacing: 0.5 }}>
          {zona.id}
        </span>
      )}
      {showName && (
        <span style={{
          fontSize: s.nameSize, fontWeight: 700, opacity: 0.92,
          letterSpacing: 0.3, marginTop: s.gap, whiteSpace: "nowrap"
        }}>
          {nome}
        </span>
      )}
    </span>
  );
}

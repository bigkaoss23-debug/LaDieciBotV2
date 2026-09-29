import { useLayoutEffect, useRef, useState } from 'react';
import { zoneMeta, ZONA_MIXTA } from './kitchenVisual';
import { orderDeadlineMs, formatMadridHHMM } from './manualGiroCocina';
import { blockZone, blockDeadline, countdownLabel } from './kitchenPacking';

// ─── [FDV1 R3] Pizzeria: il BLOCCO è l'unità visiva ───────────────────────────────────────────────────────
// §9  un giro tutto nella stessa zona → TUTTO il blocco prende il colore della zona (non un badge piccolo);
//     zone diverse → nessuna zona inventata: identità neutra "VARIAS ZONAS", ogni card tiene la sua banda.
// §10 UN SOLO orario operativo grande per blocco = riferimento del membro PIÙ URGENTE, etichettato LÍMITE.
//     È lo stesso delivery_deadline_at già usato dalla Pizzeria per la singola card, preso al minimo sul
//     blocco: nessuna formula nuova, nessun secondo timestamp di business. Le deadline individuali restano
//     intatte nei dati e, quando differiscono, compaiono in piccolo sulla card del membro.
// §11 countdown COMPATTO ("−43 min" / "+8 min") attaccato all'ora, non disperso altrove: box grande quanto l'ora.
// §12 RITIRO → "RECOGIDA": contrasto dedicato, orario di preparación, NESSUN countdown di entrega: al suo posto,
//     grande come quello del delivery, il timer di ritiro già esistente (calcTimer).

export const PICKUP = Object.freeze({ id: "RECOGIDA", nome: "RECOGIDA", color: "#0369A1", pickup: true });

export const blockIdentity = (cards = []) => {
  if (cards.length && cards.every((c) => c && c.tipo_consegna !== "DOMICILIO")) return PICKUP;
  const z = blockZone(cards, zoneMeta);
  if (!z) return ZONA_MIXTA;
  return z.mixed ? ZONA_MIXTA : z;
};

// Livello del COUNTDOWN: pura presentazione sui ms rimanenti allo stesso delivery_deadline_at. deadlineState (e
// quindi LÍMITE / URGENTE / TARDE, ordinamento, finestra del +) NON cambia: qui si sceglie solo il colore del NUMERO.
//   > 15 min neutro · ≤ 15 ambra · ≤ 10 rosso · oltre la deadline rosso deciso. Solo testo: niente fondo, box, bordi, glow.
// È l'UNICO segnale temporale forte: la card non si colora, l'etichetta URGENTE/TARDE resta piccola e testuale.
export const COUNTDOWN_WARN_MIN = 15;
export const COUNTDOWN_ALERT_MIN = 10;
export const countdownTheme = (remainingMs) => {
  if (!Number.isFinite(remainingMs) || remainingMs > COUNTDOWN_WARN_MIN * 60000) return { level: "normal" };
  if (remainingMs > COUNTDOWN_ALERT_MIN * 60000) return { level: "warn" };
  if (remainingMs >= 0) return { level: "alert" };
  return { level: "late" };
};

// Colore del testo: tinta di stato fissa (ambra / rosso), si muove SOLO la luminosità finché il numero raggiunge
// 4.5:1 sul colore reale dell'header (zona / RECOGIDA / GIRO). Ambra e <10 preferiscono schiarire (sobri accanto
// all'ora bianca), TARDE preferisce scurire (più deciso); se sul lato preferito 4.5 non è raggiungibile si passa
// all'altro. <10 e TARDE non coincidono mai. Neutro = bianco come l'ora.
export const INK_TARGET = 4.5;
const INK_STATE = { warn: [45, 0.96, 0.65, "light"], alert: [0, 0.93, 0.82, "light"], late: [0, 0.90, 0.70, "dark"] };
const hsl = (h, s, l) => { const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))); };
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
export const contrastRatio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const hexToRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || "")); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const inkSide = ([h, s, pref], bg, side) => {
  for (let i = 0; i <= 200; i++) { const l = side === "light" ? pref + (1 - pref) * i / 200 : pref - pref * i / 200;
    if (l > 0.97 || l < 0.04) break; if (contrastRatio(hsl(h, s, l), bg) >= INK_TARGET) return l; }
  return null;
};
const inkPick = (st, bg) => { const d = INK_STATE[st], other = d[3] === "light" ? "dark" : "light";
  for (const side of [d[3], other]) { const l = inkSide(d, bg, side); if (l != null) return { side, l }; }
  return [{ side: "light", l: 0.97 }, { side: "dark", l: 0.04 }].reduce((a, c) => (contrastRatio(hsl(d[0], d[1], c.l), bg) > contrastRatio(hsl(d[0], d[1], a.l), bg) ? c : a));
};
export const inkOn = (level, bg) => {
  const bgRgb = Array.isArray(bg) ? bg : hexToRgb(bg);
  if (!INK_STATE[level]) return { ink: "#FFFFFF", rgb: [255, 255, 255], dark: false };
  if (!bgRgb) { const d = INK_STATE[level], rgb = hsl(d[0], d[1], d[2]); return { ink: `rgb(${rgb})`, rgb, dark: false }; }
  let p = inkPick(level, bgRgb);
  if (level === "alert" || level === "late") {
    const a = inkPick("alert", bgRgb), t = inkPick("late", bgRgb);
    if (a.side === t.side && Math.abs(a.l - t.l) < 0.08) {
      if (a.side === "light") a.l = Math.min(0.97, t.l + 0.08); else t.l = Math.max(0.04, a.l - 0.08);
    }
    p = level === "alert" ? a : t;
  }
  const rgb = hsl(INK_STATE[level][0], INK_STATE[level][1], p.l);
  return { ink: `rgb(${rgb})`, rgb, dark: lum(rgb) < 0.2 };
};

// RECOGIDA: il countdown è ESATTAMENTE il timer di ritiro già esistente (calcTimer di TabListos, invariato):
// stesso testo "MM:SS" ("-MM:SS" = oltre l'orario), qui solo reso leggibile. I ms rimanenti servono SOLO al colore
// del numero (stesse soglie del delivery); senza orario il timer conta dall'ordine → nessuna soglia, TARDE se scaduto.
export const pickupCountdown = (t) => {
  if (!t) return null;
  const text = `${t.scaduto && t.conOrario ? "-" : ""}${String(t.mm).padStart(2, "0")}:${String(t.ss).padStart(2, "0")}`;
  const abs = (t.mm * 60 + t.ss) * 1000;
  const ms = t.conOrario ? (t.scaduto ? -abs : abs) : (t.scaduto ? -1 : NaN);
  return { text, ms, late: !!t.scaduto, conOrario: !!t.conOrario };
};

const CAP_H = 11;
const NUM_H = 34;
const CD_H = 34;     // riga del countdown = riga dell'ora (solo testo, nessun contenitore)
const CH = 0.62;    // larghezza carattere monospace in em (DM Mono 0.6 + margine)
const TIME_PX = 31, CD_PX = 29, UNIT_PX = 14, MIN_TIME = 24, MIN_CD = 17, GAP = 14, GAP_WIDE = 24;   // GAP = distanza MINIMA ora↔countdown (il countdown sta a destra); GAP_WIDE senza fit (header GIRO Cocina)
const STATE_TEXT = { normal: "LÍMITE", near: "URGENTE", late: "TARDE" };

// larghezza reale disponibile (ResizeObserver; assente in jsdom → dimensioni base)
const useWidthOf = () => {
  const ref = useRef(null);
  const [w, setW] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
};

// Riga orari (header blocco / card Cocina / header GIRO Cocina):   LÍMITE            ← etichetta piccola
//                                                                  18:08        −19 min ← ora 31px · countdown 29px
// ORA a sinistra, COUNTDOWN (solo testo) a destra; i numeri scalano sulla larghezza reale (mai tagliati).
// `fit={false}` (header GIRO Cocina, spazio abbondante): niente adattamento — la riga misurerebbe solo se stessa.
// `bg` = colore dell'header su cui sta la riga: serve solo a scegliere un colore del numero leggibile (inkOn).
export const TimeCountdown = ({ pickup = false, dl = null, nowMs = null, pickupHora = null, pickupTimer = null, height = 48, fit = true, bg = null }) => {
  const st = (dl && dl.state) || "normal";
  const cd = pickup ? null : countdownLabel(dl && dl.ms, nowMs);
  const pk = pickup ? pickupTimer : null;
  const cdt = countdownTheme(pickup ? (pk ? pk.ms : NaN) : (dl && Number.isFinite(dl.ms) && Number.isFinite(nowMs) ? dl.ms - nowMs : NaN));
  const [ref, w] = useWidthOf();
  const ink = inkOn(cdt.level, bg);

  const timeText = pickup ? (pickupHora || "—") : (dl ? dl.hhmm : "—");
  const cdNum = pickup ? (pk ? pk.text : "") : (cd ? cd.text.replace(/ min$/, "") : "");
  const unitW = !pickup && cd ? UNIT_PX * CH * 4 : 0;
  let timePx = TIME_PX, cdPx = CD_PX;
  if (fit && Number.isFinite(w) && w > 0) {
    const tChars = Math.max(5, timeText.length), cChars = Math.max(3, cdNum.length);
    const cdW = (px) => (cdNum ? cChars * CH * px + unitW : 0);
    const room = w - tChars * CH * TIME_PX - (cdNum ? GAP : 0);
    if (cdNum && cdW(CD_PX) > room) cdPx = Math.max(MIN_CD, Math.floor((room - unitW) / (cChars * CH)));
    const left = w - cdW(cdPx) - (cdNum ? GAP : 0);
    if (tChars * CH * TIME_PX > left) timePx = Math.max(MIN_TIME, Math.floor(left / (tChars * CH)));
  }
  const num = { whiteSpace: "nowrap", fontFamily: "'DM Mono',monospace", fontWeight: 900, lineHeight: `${NUM_H}px`, letterSpacing: -.5 };
  const cap = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0,
    fontSize: 10, fontWeight: 900, letterSpacing: .6, lineHeight: `${CAP_H}px`, height: CAP_H, opacity: .8 };   // sempre secondaria
  // ordine DOM storico: delivery "19:08 URGENTE −43 min", RECOGIDA "HORA 🕐 21:20 07:59"; l'etichetta sale sopra con `order`
  const caption = pickup ? (
    <span style={{ ...cap, display: "flex", alignItems: "center", gap: 4, order: -1, opacity: .8 }}>
      <span style={{ order: 1 }}>HORA</span><span data-testid="pickup-tag" style={{ fontSize: 10 }}>🕐</span>
    </span>
  ) : (
    <span data-testid="block-state" style={{ ...cap, order: -1 }}>{STATE_TEXT[st]}</span>
  );
  return (
    <div ref={ref} data-testid="block-time-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: fit ? GAP : GAP_WIDE, height, minWidth: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flexShrink: 0 }}>
        {pickup && caption}
        <span data-testid="block-main-time" title={pickup ? "Hora de recogida" : "Hora límite de entrega"}
          style={{ ...num, fontSize: timePx }}>{timeText}</span>
        {!pickup && caption}
      </div>
      {cdNum && (
        <div data-testid="block-countdown-box" data-level={cdt.level}
          title={pickup ? (pk && !pk.conOrario ? "Desde la orden" : "Tiempo hasta la recogida") : "Tiempo hasta la hora límite"} style={{
          height: CD_H, marginTop: CAP_H, boxSizing: "border-box", padding: 0, flexShrink: 0,   // in asse con l'ora — nessun fondo, nessun box
          display: "flex", alignItems: "center", background: "none", color: ink.ink,
          textShadow: ink.dark ? "none" : "0 1px 2px rgba(0,0,0,0.35)",
        }}>
          <span data-testid={pickup ? "pickup-prep" : "block-countdown"} style={{ ...num, lineHeight: `${CD_H}px` }}>
            <span style={{ fontSize: cdPx }}>{cdNum}</span>
            {unitW > 0 && <span style={{ fontSize: UNIT_PX, letterSpacing: 0, opacity: .75 }}> min</span>}
          </span>
        </div>
      )}
    </div>
  );
};

// Header del blocco (Pizzeria e Cocina): ALTEZZA FISSA, identica per zona, GIRO e RECOGIDA — mai va a capo.
//   riga 1 (24px):  📍 CENTRO · 3 pedidos · GIRO G1  /  #id · cliente             ← DOVE / TIPO (un solo blocco)
//   riga 2 (48px):  LÍMITE                                                      ← QUANTO / QUANDO
//                   18:08                                        −19 min
// Il controllo di priorità NON sta nell'header: è il bottone 🕐 nel footer della card, accanto a LISTO.
// `member` (card dentro un GIRO in Cocina): SOLO riga 1 (zona + #id · cliente) — ora, countdown e stato vivono una
// volta sola, nell'header del giro; il proprio límite, se diverso, è una mini-riga nella card (TabCocina).
export const HEADER_H = 88;
export const MEMBER_H = 36;
const ROW1_H = 24;
const ROW2_H = 48;
export const BlockHeader = ({ identity, count = null, subtitle = null, dl, nowMs, pickupHora, pickupTimer = null, giroLabel = null, member = false, testId = "block-header" }) => {
  const pickup = !!identity.pickup;
  const st = (dl && dl.state) || "normal";
  const cell = { minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  return (
    <div data-testid={testId} data-state={st} data-pickup={pickup ? "1" : "0"} data-member={member ? "1" : undefined} style={{
      background: identity.color, color: "#FFFFFF", padding: "6px 9px", height: member ? MEMBER_H : HEADER_H, boxSizing: "border-box",
      textShadow: "0 1px 2px rgba(0,0,0,0.35)",   // leggibile anche sulle zone chiare (BUENAVISTA, MARINAS)
      display: "flex", flexDirection: "column", gap: 4, overflow: "hidden", flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, height: ROW1_H }}>
        <span data-testid="zone-badge" data-zone={identity.id} style={{
          ...cell, flexShrink: 0, maxWidth: "70%", background: identity.color,
          fontSize: 18, fontWeight: 900, letterSpacing: .4, lineHeight: `${ROW1_H}px`,
        }}>
          {pickup ? "🏪 " : "📍 "}{identity.nome}
        </span>
        {count != null && (
          <span data-testid="block-count" style={{ ...cell, fontSize: 13, fontWeight: 800, opacity: .9 }}>
            · {count} pedido{count !== 1 ? "s" : ""}
          </span>
        )}
        {giroLabel && (   // un solo blocco con la zona: "CENTRO · 2 pedidos · GIRO G1" (testo, nessuna pillola)
          <span data-testid="block-giro" style={{ fontSize: 13, fontWeight: 900, letterSpacing: .4, whiteSpace: "nowrap", flexShrink: 0 }}>
            · {giroLabel}
          </span>
        )}
        {subtitle && (
          <span style={{ ...cell, fontSize: 13, fontWeight: 800, opacity: .95 }}>{subtitle}</span>
        )}
        <span style={{ flex: 1, minWidth: 0 }} />
      </div>
      {!member && <TimeCountdown pickup={pickup} dl={dl} nowMs={nowMs} pickupHora={pickupHora} pickupTimer={pickupTimer} height={ROW2_H} bg={identity.color} />}
    </div>
  );
};

// Riga prodotto (Pizzeria e Cocina): ×N fisso a sinistra; a destra in colonna NOME (max 2 righe, parole intere)
// → alias piccolo → ingredienti piccoli (max 2 righe) → variazione cliente in arancione.
export const ItemRow = ({ qty, name, alias = "", ing = "", variant = "", accent = "#374151", compact = false, narrow = false, divider = null }) => {
  const nameSize = narrow ? (compact ? 18 : 20) : (compact ? 20 : 25);
  const qtySize = narrow ? (compact ? 18 : 20) : (compact ? 20 : 24);
  return (
    <div style={{ borderTop: divider ? `1px dashed ${divider}` : "none", paddingTop: divider ? (compact ? 5 : 7) : 0, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
        <span data-testid="qty-badge" style={{
          background: accent, color: "#fff", borderRadius: 8,
          padding: compact ? "2px 9px" : "3px 11px",
          fontFamily: "'DM Mono',monospace", fontWeight: 900,
          fontSize: qtySize, lineHeight: 1.15, flexShrink: 0,
        }}>×{qty}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div data-testid="pizza-name" style={{
            color: "#0B0B0B", fontSize: nameSize, fontWeight: 900,
            lineHeight: 1.1, letterSpacing: -.2, textTransform: "uppercase", minWidth: 0,
            marginTop: compact ? 1 : 2, overflowWrap: "break-word",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{name}</div>
          {alias && (
            <div data-testid="pizza-alias" style={{
              color: "#9CA3AF", fontSize: compact ? 11 : 12, fontWeight: 700, marginTop: 1,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{alias}</div>
          )}
          {ing && (
            <div style={{
              color: "#6B7280", fontSize: compact ? 10 : 11.5, fontWeight: 500, lineHeight: 1.35,
              marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>{ing}</div>
          )}
          {variant && (
            <div style={{
              display: "inline-block", background: "#FF6B00", color: "#fff", borderRadius: 7,
              padding: "2px 9px", fontSize: compact ? 11 : 13, fontWeight: 800, marginTop: 4,
            }}>⚠ {variant}</div>
          )}
        </div>
      </div>
    </div>
  );
};

// Contenitore atomico. `width` = colonne occupate nella griglia esterna (span). Un giro più largo della riga
// occupa la riga intera e manda a capo INTERNAMENTE: resta un solo box, mai spezzato tra due righe.
// alignItems "start": una card con un solo prodotto NON si stira all'altezza della più alta — lo spazio
// verticale recuperato è quello che il pizzaiolo usa per vedere più ordini senza scorrere.
export const KitchenBlock = ({ cards, width, cols, nowMs, children, giroId = null, giroLabel = null, pickupHora = null, pickupTimer = null }) => {
  const identity = blockIdentity(cards);
  const dl = identity.pickup ? null : blockDeadline(cards, nowMs);
  const inner = Math.max(1, Math.min(width, cards.length));
  return (
    <div data-testid="kitchen-block" data-identity={identity.id} data-giro={giroId || ""} data-span={width} style={{
      gridColumn: `span ${width}`, border: `3px solid ${identity.color}`, borderRadius: 14, overflow: "hidden",
      background: "#FFFFFF", minWidth: 0, display: "flex", flexDirection: "column",   // fondo libero = bianco
    }}>
      <BlockHeader identity={identity} count={cards.length} dl={dl} nowMs={nowMs} pickupHora={pickupHora} pickupTimer={pickupTimer} giroLabel={giroLabel} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${inner},1fr)`, gap: 7, padding: 7, alignItems: "start" }}>
        {children}
      </div>
    </div>
  );
};

// Riga d'identità della card DENTRO il blocco: #id, cliente e il PROPRIO límite solo quando differisce
// dall'orario principale del blocco (così non ci sono più tre orari giganti che competono). Nessun badge di stato:
// URGENTE / TARDE vive una sola volta, piccolo, nell'header del blocco — il segnale forte è il countdown.
export const CardIdentity = ({ o, zone, blockMs, showZone }) => {
  const own = orderDeadlineMs(o);
  const differs = Number.isFinite(own) && Number.isFinite(blockMs) && own !== blockMs;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", rowGap: 3, padding: "5px 9px", background: "#FFFFFF", borderBottom: "1px solid #E5E7EB" }}>
      <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 900, fontSize: 17, color: "#111827" }}>{o.id}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 110 }}>
        {o.nombre || ""}
      </span>
      {showZone && zone && (
        <span data-testid="card-zone" data-zone={zone.id} style={{
          background: zone.color, color: "#FFFFFF", borderRadius: 5, padding: "1px 6px", fontSize: 10, fontWeight: 900, whiteSpace: "nowrap",
        }}>{zone.nome || zone.id}</span>
      )}
      <span style={{ flex: 1, minWidth: 4 }} />
      {differs && (
        <span data-testid="card-own-limit" title="Hora límite propia de este pedido" style={{
          fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: 800, color: "#374151",
          background: "#F3F4F6", borderRadius: 5, padding: "1px 6px", whiteSpace: "nowrap",
        }}>límite {formatMadridHHMM(own)}</span>
      )}
    </div>
  );
};

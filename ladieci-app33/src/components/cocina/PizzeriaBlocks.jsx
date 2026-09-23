import { zoneMeta, ZONA_MIXTA, DEADLINE_LABEL } from './kitchenVisual';
import { orderDeadlineMs, formatMadridHHMM } from './manualGiroCocina';
import { blockZone, blockDeadline, countdownLabel } from './kitchenPacking';

// ─── [FDV1 R3] Pizzeria: il BLOCCO è l'unità visiva ───────────────────────────────────────────────────────
// §9  un giro tutto nella stessa zona → TUTTO il blocco prende il colore della zona (non un badge piccolo);
//     zone diverse → nessuna zona inventata: identità neutra "VARIAS ZONAS", ogni card tiene la sua banda.
// §10 UN SOLO orario operativo grande per blocco = riferimento del membro PIÙ URGENTE, etichettato LÍMITE.
//     È lo stesso delivery_deadline_at già usato dalla Pizzeria per la singola card, preso al minimo sul
//     blocco: nessuna formula nuova, nessun secondo timestamp di business. Le deadline individuali restano
//     intatte nei dati e, quando differiscono, compaiono in piccolo sulla card del membro.
// §11 countdown COMPATTO ("−43 min" / "+8 min") attaccato all'ora, non disperso altrove.
// §12 RITIRO → "RECOGIDA": contrasto dedicato, orario di preparación, NESSUN countdown di entrega.

export const PICKUP = Object.freeze({ id: "RECOGIDA", nome: "RECOGIDA", color: "#0369A1", pickup: true });

export const blockIdentity = (cards = []) => {
  if (cards.length && cards.every((c) => c && c.tipo_consegna !== "DOMICILIO")) return PICKUP;
  const z = blockZone(cards, zoneMeta);
  if (!z) return ZONA_MIXTA;
  return z.mixed ? ZONA_MIXTA : z;
};

const stateTheme = (state) => (state === "late"
  ? { chip: "#B91C1C", ink: "#FFFFFF" }
  : state === "near" ? { chip: "#B45309", ink: "#FFFFFF" } : null);

// Header del blocco (Pizzeria e Cocina): ALTEZZA FISSA, identica per zona, GIRO e RECOGIDA — mai va a capo.
//   riga 1 (24px):  📍 CENTRO · 3 pedidos / #id · cliente        [GIRO G1]
//   riga 2 (48px):  LÍMITE|URGENTE|TARDE  −43 min                [−][+]
//                   19:08
// Ordine DOM del gruppo orario = ora → stato → countdown (il testo resta "19:08 URGENTE −43 min"); la posizione
// visiva la decide la griglia. Testi eccezionalmente lunghi → ellissi, la geometria non cambia.
export const HEADER_H = 88;
const ROW1_H = 24;
const ROW2_H = 48;
const STATE_TEXT = { normal: "LÍMITE", near: "URGENTE", late: "TARDE" };
export const BlockHeader = ({ identity, count = null, subtitle = null, dl, nowMs, control, pickupHora, pickupTimer = null, giroLabel = null, testId = "block-header" }) => {
  const st = (dl && dl.state) || "normal";
  const cd = identity.pickup ? null : countdownLabel(dl && dl.ms, nowMs);
  const th = stateTheme(st);
  const cell = { minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  return (
    <div data-testid={testId} data-state={st} data-pickup={identity.pickup ? "1" : "0"} style={{
      background: identity.color, color: "#FFFFFF", padding: "6px 9px", height: HEADER_H, boxSizing: "border-box",
      textShadow: "0 1px 2px rgba(0,0,0,0.35)",   // leggibile anche sulle zone chiare (BUENAVISTA, MARINAS)
      display: "flex", flexDirection: "column", gap: 4, overflow: "hidden", flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, height: ROW1_H }}>
        <span data-testid="zone-badge" data-zone={identity.id} style={{
          ...cell, flexShrink: 0, maxWidth: "70%", background: identity.color,
          fontSize: 18, fontWeight: 900, letterSpacing: .4, lineHeight: `${ROW1_H}px`,
        }}>
          {identity.pickup ? "🏪 " : "📍 "}{identity.nome}
        </span>
        {count != null && (
          <span data-testid="block-count" style={{ ...cell, fontSize: 13, fontWeight: 800, opacity: .9 }}>
            · {count} pedido{count !== 1 ? "s" : ""}
          </span>
        )}
        {subtitle && (
          <span style={{ ...cell, fontSize: 13, fontWeight: 800, opacity: .95 }}>{subtitle}</span>
        )}
        <span style={{ flex: 1, minWidth: 0 }} />
        {giroLabel && (
          <span data-testid="block-giro" style={{
            background: "rgba(0,0,0,0.28)", border: "1.5px solid rgba(255,255,255,0.7)", borderRadius: 7,
            padding: "1px 7px", fontSize: 12, fontWeight: 900, letterSpacing: .6, whiteSpace: "nowrap", flexShrink: 0,
          }}>{giroLabel}</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: ROW2_H, minWidth: 0 }}>
        {/* ora principale + stato + countdown: un solo gruppo, mai separati */}
        {identity.pickup ? (
          <span style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gridTemplateRows: "16px 32px", columnGap: 6, alignItems: "center" }}>
            <span style={{ ...cell, gridArea: "1 / 1 / 2 / 3", fontSize: 11, fontWeight: 900, letterSpacing: .8, opacity: .85 }}>HORA</span>
            <span data-testid="pickup-tag" style={{ gridArea: "2 / 1", fontSize: 22, lineHeight: 1 }}>🕐</span>
            <span data-testid="block-main-time" title="Hora de recogida" style={{
              ...cell, gridArea: "2 / 2", fontFamily: "'DM Mono',monospace", fontSize: 32, fontWeight: 900, lineHeight: "32px",
            }}>{pickupHora || "—"}</span>
            {pickupTimer && (
              <span data-testid="pickup-prep" style={{ ...cell, gridArea: "1 / 2", justifySelf: "end", fontFamily: "'DM Mono',monospace", fontSize: 12,
                fontWeight: 900, lineHeight: "16px", background: "rgba(255,255,255,0.22)", borderRadius: 6, padding: "0 6px" }}>{pickupTimer}</span>
            )}
          </span>
        ) : (
          <span style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0,auto) auto", justifyContent: "start", gridTemplateRows: "16px 32px", columnGap: 5, alignItems: "center" }}>
            <span data-testid="block-main-time" title="Hora límite de entrega" style={{
              ...cell, gridArea: "2 / 1 / 3 / 3", fontFamily: "'DM Mono',monospace", fontSize: 32, fontWeight: 900, lineHeight: "32px",
            }}>{dl ? dl.hhmm : "—"}</span>
            <span data-testid="block-state" style={{
              ...cell, gridArea: "1 / 1", fontSize: 10, fontWeight: 900, letterSpacing: .4, lineHeight: "16px",
              ...(th ? { background: th.chip, color: th.ink, borderRadius: 5, padding: "0 5px" } : { opacity: .85 }),
            }}>{STATE_TEXT[st]}</span>
            {cd && (
              <span data-testid="block-countdown" style={{
                whiteSpace: "nowrap", gridArea: "1 / 2", justifySelf: "start",
                background: cd.late ? "#7F1D1D" : "rgba(255,255,255,0.22)", borderRadius: 6, padding: "0 5px",
                fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: 900, lineHeight: "16px",
              }}>{cd.text}</span>
            )}
          </span>
        )}
        {control && <span style={{ flexShrink: 0 }}>{control}</span>}
      </div>
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
export const KitchenBlock = ({ cards, width, cols, nowMs, control, children, giroId = null, giroLabel = null, pickupHora = null }) => {
  const identity = blockIdentity(cards);
  const dl = identity.pickup ? null : blockDeadline(cards, nowMs);
  const inner = Math.max(1, Math.min(width, cards.length));
  return (
    <div data-testid="kitchen-block" data-identity={identity.id} data-giro={giroId || ""} data-span={width} style={{
      gridColumn: `span ${width}`, border: `3px solid ${identity.color}`, borderRadius: 14, overflow: "hidden",
      background: "#FFFFFF", minWidth: 0, display: "flex", flexDirection: "column",   // fondo libero = bianco
    }}>
      <BlockHeader identity={identity} count={cards.length} dl={dl} nowMs={nowMs} control={control} pickupHora={pickupHora} giroLabel={giroLabel} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${inner},1fr)`, gap: 7, padding: 7, alignItems: "start" }}>
        {children}
      </div>
    </div>
  );
};

// Riga d'identità della card DENTRO il blocco: #id, cliente, stato, e il PROPRIO límite solo quando differisce
// dall'orario principale del blocco (così non ci sono più tre orari giganti che competono).
export const CardIdentity = ({ o, zone, blockMs, showZone }) => {
  const own = orderDeadlineMs(o);
  const differs = Number.isFinite(own) && Number.isFinite(blockMs) && own !== blockMs;
  const st = (o.dl && o.dl.state) || "normal";
  const th = stateTheme(st);
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
      {th && (
        <span data-testid="card-state" style={{
          background: th.chip, color: th.ink, borderRadius: 5, padding: "1px 7px", fontSize: 11, fontWeight: 900, letterSpacing: .4, whiteSpace: "nowrap",
        }}>{DEADLINE_LABEL[st]}</span>
      )}
    </div>
  );
};

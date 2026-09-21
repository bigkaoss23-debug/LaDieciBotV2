import { zoneMeta, ZONA_MIXTA, DEADLINE_LABEL } from './kitchenVisual';
import { orderDeadlineMs, formatMadridHHMM } from './manualGiroCocina';
import { blockZone, blockDeadline, countdownLabel } from './kitchenPacking';

// ─── [FDV1 R3] Pizzeria: il BLOCCO è l'unità visiva ───────────────────────────────────────────────────────
// §9  un giro tutto nella stessa zona → TUTTO il blocco prende il colore della zona (non un badge piccolo);
//     zone diverse → nessuna zona inventata: identità neutra "VARIAS ZONAS", ogni card tiene la sua banda.
// §10 UN SOLO orario operativo grande per blocco = riferimento del membro PIÙ URGENTE. È lo stesso
//     delivery_deadline_at già usato dalla Pizzeria per la singola card, preso al minimo sul blocco:
//     nessuna formula nuova, nessun secondo timestamp di business. Le deadline individuali restano intatte
//     nei dati e, quando differiscono, compaiono in piccolo sulla card del membro.
// §11 countdown = proiezione visiva dello stesso riferimento, aggiornato dal clock della pagina.
// §12 RITIRO → "Recogida en local": contrasto dedicato, orario di preparación, NESSUN countdown di entrega.

export const PICKUP = Object.freeze({ id: "RECOGIDA", nome: "Recogida en local", color: "#0369A1", pickup: true });

export const blockIdentity = (cards = []) => {
  if (cards.length && cards.every((c) => c && c.tipo_consegna !== "DOMICILIO")) return PICKUP;
  const z = blockZone(cards, zoneMeta);
  if (!z) return ZONA_MIXTA;
  return z.mixed ? ZONA_MIXTA : z;
};

const stateTheme = (state) => (state === "late"
  ? { chip: "#B91C1C", ink: "#FFFFFF" }
  : state === "near" ? { chip: "#B45309", ink: "#FFFFFF" } : null);

// Header del blocco: zona (nome operativo) · N pedidos · UN orario · countdown.
export const BlockHeader = ({ identity, count, dl, nowMs, control, pickupHora }) => {
  const st = (dl && dl.state) || "normal";
  const cd = identity.pickup ? null : countdownLabel(dl && dl.ms, nowMs);
  const late = st === "late";
  return (
    <div data-testid="block-header" data-state={st} data-pickup={identity.pickup ? "1" : "0"} style={{
      background: identity.color, color: "#FFFFFF", padding: "9px 14px",
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
    }}>
      <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: .3, whiteSpace: "nowrap" }}>
        {identity.pickup ? "🏪 " : "📍 "}{identity.nome}
      </span>
      <span data-testid="block-count" style={{ fontSize: 13, fontWeight: 800, opacity: .9, whiteSpace: "nowrap" }}>
        · {count} pedido{count !== 1 ? "s" : ""}
      </span>
      <span style={{ flex: 1, minWidth: 8 }} />
      {control}
      <span data-testid="block-main-time" title={identity.pickup ? "Hora de recogida" : "Hora límite de entrega"} style={{
        fontFamily: "'DM Mono',monospace", fontSize: 30, fontWeight: 900, lineHeight: 1,
        color: late ? "#FFE4E6" : "#FFFFFF", whiteSpace: "nowrap",
      }}>{identity.pickup ? (pickupHora || "—") : (dl ? dl.hhmm : "—")}</span>
      {identity.pickup ? (
        <span data-testid="pickup-tag" style={{
          background: "rgba(255,255,255,0.22)", borderRadius: 999, padding: "4px 11px",
          fontSize: 12, fontWeight: 900, letterSpacing: .4, whiteSpace: "nowrap",
        }}>RECOGIDA</span>
      ) : cd ? (
        <span data-testid="block-countdown" style={{
          background: cd.late ? "#7F1D1D" : "rgba(255,255,255,0.22)", borderRadius: 999, padding: "5px 11px",
          fontSize: 13, fontWeight: 900, whiteSpace: "nowrap",
        }}>{cd.late ? "⚠ " : "⏱ "}{cd.text}</span>
      ) : null}
      {!identity.pickup && st !== "normal" && (
        <span data-testid="block-state" style={{
          background: stateTheme(st).chip, color: stateTheme(st).ink, borderRadius: 8,
          padding: "4px 10px", fontSize: 12, fontWeight: 900, letterSpacing: .5, whiteSpace: "nowrap",
        }}>{DEADLINE_LABEL[st]}</span>
      )}
    </div>
  );
};

// Contenitore atomico. `width` = colonne occupate nella griglia esterna (span). Un giro più largo della riga
// occupa la riga intera e manda a capo INTERNAMENTE: resta un solo box, mai spezzato tra due righe.
export const KitchenBlock = ({ cards, width, cols, nowMs, control, children, giroId = null, pickupHora = null }) => {
  const identity = blockIdentity(cards);
  const dl = identity.pickup ? null : blockDeadline(cards, nowMs);
  const inner = Math.max(1, Math.min(width, cards.length));
  return (
    <div data-testid="kitchen-block" data-identity={identity.id} data-giro={giroId || ""} data-span={width} style={{
      gridColumn: `span ${width}`, border: `4px solid ${identity.color}`, borderRadius: 16, overflow: "hidden",
      background: `${identity.color}14`, minWidth: 0, display: "flex", flexDirection: "column",
    }}>
      <BlockHeader identity={identity} count={cards.length} dl={dl} nowMs={nowMs} control={control} pickupHora={pickupHora} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${inner},1fr)`, gap: 8, padding: 8, flex: 1 }}>
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
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 10px", background: "#FFFFFF", borderBottom: "1px solid #E5E7EB" }}>
      <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 900, fontSize: 18, color: "#111827" }}>{o.id}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#4B5563", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>
        {o.nombre || ""}
      </span>
      {showZone && zone && (
        <span data-testid="card-zone" data-zone={zone.id} style={{
          background: zone.color, color: "#FFFFFF", borderRadius: 6, padding: "2px 7px", fontSize: 10, fontWeight: 900, whiteSpace: "nowrap",
        }}>{zone.nome || zone.id}</span>
      )}
      <span style={{ flex: 1, minWidth: 4 }} />
      {differs && (
        <span data-testid="card-own-limit" title="Hora límite propia de este pedido" style={{
          fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: 800, color: "#374151",
          background: "#F3F4F6", borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap",
        }}>límite {formatMadridHHMM(own)}</span>
      )}
      {th && (
        <span data-testid="card-state" style={{
          background: th.chip, color: th.ink, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 900, letterSpacing: .4, whiteSpace: "nowrap",
        }}>{DEADLINE_LABEL[st]}</span>
      )}
    </div>
  );
};

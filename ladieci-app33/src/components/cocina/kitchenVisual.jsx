import { ZONE_DELIVERY } from '../../zones';

// [FDV1 R3] Contratto visivo Cocina / Pizzeria (DOMICILIO).
//   ZONA  = canale proprio e persistente: banda laterale + badge con il colore di zona (stesso di Entregas).
//           Non cambia mai con lo stato temporale → una card può essere "Q3 + TARDE" senza perdere Q3.
//   TEMPO = area HORA LÍMITE (header): NORMAL neutro / URGENTE ambra / TARDE rosso pieno (pulse leggero, no strobo).
//   GIRO  = contenitore comune con colore proprio (palette distinta dalle zone), identificativo G1/G2, un solo ±.

// [FDV1 R3 §7] Al pizzaiolo i codici tecnici Q1/Q3/Q4 non dicono niente: in cucina si mostra SEMPRE il nome
// operativo del quartiere (CENTRO, LAS MARINAS, CORTIJOS, …). `id` resta solo come attributo dati / debug.
// Nessuna modifica alla logica DB delle zone: è pura presentazione.
export const SIN_ZONA = Object.freeze({ id: "SIN_ZONA", nome: "SIN ZONA", color: "#6B7280", none: true });

export const zoneMeta = (o) => {
  const id = o && o.zona;
  const z = id ? ZONE_DELIVERY.find((x) => x.id === id) : null;
  if (!z) return SIN_ZONA;
  const nome = z.nomeBreve || z.nome || z.id;
  return { id: z.id, nome, color: z.colore, none: false };
};

// Zona "mista": un giro con zone diverse NON inventa una zona — prende un'identità neutra dedicata e ogni
// card conserva la propria banda/badge di zona.
export const ZONA_MIXTA = Object.freeze({ id: "MIXTA", nome: "VARIAS ZONAS", color: "#334155", mixed: true });

// Palette giri: toni scuri e neutri, lontani dai colori zona (teal, viola chiaro, arancio, magenta, verde).
export const GIRO_COLORS = ["#1E3A8A", "#4C1D95", "#1F2937", "#713F12", "#134E4A"];
export const giroColor = (giro) => {
  const seq = giro && giro.seq != null && giro.seq !== "" ? Number(giro.seq) : NaN;
  const m = String((giro && giro.id) || "").match(/_(\d+)$/);
  const n = Number.isFinite(seq) && seq > 0 ? seq : (m ? Number(m[1]) : 0);
  return GIRO_COLORS[(Math.max(1, n) - 1) % GIRO_COLORS.length];
};

export const DEADLINE_LABEL = { normal: "HORA LÍMITE", near: "URGENTE", late: "TARDE" };

export const deadlineTheme = (state, light) => {
  if (state === "late") return { bg: "#DC2626", fg: "#FFFFFF", sub: "#FFFFFF", pulse: true };
  if (state === "near") return { bg: "#F59E0B", fg: "#1F1300", sub: "#1F1300", pulse: false };
  return light
    ? { bg: "#F3F4F6", fg: "#111827", sub: "#4B5563", pulse: false }
    : { bg: "#1F2937", fg: "#FFFFFF", sub: "rgba(255,255,255,0.7)", pulse: false };
};

// keyframes una sola volta (pulse leggero: solo opacità dello sfondo, 2 s)
export const KitchenVisualStyles = () => (
  <style>{`@keyframes fdv1Pulse{0%,100%{filter:brightness(1)}50%{filter:brightness(0.86)}}`}</style>
);

export const ZoneBadge = ({ zone, size = 16 }) => (
  <span data-testid="zone-badge" data-zone={zone.id} style={{
    display: "inline-flex", alignItems: "baseline", gap: 6, background: zone.color, color: "#FFFFFF",
    borderRadius: 8, padding: "3px 10px", fontWeight: 900, fontSize: size, lineHeight: 1.1, letterSpacing: .3,
    border: zone.none ? "2px dashed #FFFFFF" : "none", whiteSpace: "nowrap",
  }}>
    {zone.nome || zone.id}
  </span>
);

// Header della card: zona a sinistra (persistente), HORA LÍMITE a destra nel colore di stato.
export const DeadlineHeader = ({ o, zone, light, right = null }) => {
  const st = (o.dl && o.dl.state) || "normal";
  const th = deadlineTheme(st, light);
  return (
    <div data-testid="deadline-header" data-state={st} style={{
      background: th.bg, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
      animation: th.pulse ? "fdv1Pulse 2s ease-in-out infinite" : "none",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <ZoneBadge zone={zone} />
        <span style={{ fontWeight: 800, fontSize: 13, color: th.fg, opacity: .9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 170 }}>
          <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 900 }}>{o.id}</span>{o.nombre ? ` · ${o.nombre}` : ""}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }} title="Hora límite de entrega: la más tardía entre creación + 55 min y la hora prometida al cliente">
        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 42, fontWeight: 900, lineHeight: 1, color: th.fg }}>{o.dl ? o.dl.hhmm : "—"}</div>
        <div style={{ fontSize: st === "normal" ? 11 : 15, fontWeight: 900, letterSpacing: .6, color: th.sub }}>{DEADLINE_LABEL[st]}</div>
        {right}
      </div>
    </div>
  );
};

// Contenitore del giro: occupa tutta la riga della griglia; i membri restano card con la propria zona.
export const GiroGroup = ({ giro, label, count, cols, light, control, children }) => {
  const col = giroColor(giro);
  return (
    <div data-testid="giro-group" data-giro={label} style={{
      gridColumn: "1 / -1", border: `4px solid ${col}`, borderRadius: 18, overflow: "hidden",
      background: light ? `${col}0F` : `${col}33`,
    }}>
      <div style={{ background: col, color: "#FFFFFF", padding: "8px 12px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: .5 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 800, opacity: .85 }}>Giro · {count} pedidos</span>
        <span style={{ flex: 1 }} />
        {control}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 10, padding: 10 }}>{children}</div>
    </div>
  );
};

import { useState } from 'react';
import { C } from '../../constants';
import { formatOrderNumber } from '../../utils/orderNumber';
import { resolveItemProductNames } from '../../menu/itemDisplay';

// LISTOS_UNIFICADO_V1 -- one compact, collapsed-by-default row at the bottom
// of Listos for everything already completed tonight: served Sala comandas
// (state RETIRADO on a still-open table session -- see useMesaReadyCommands'
// servedRows, an honest, disclosed limit: a comanda drops out of this list
// once its table is paid/closed, since `mesaApi.floor()` stops returning
// that session) and Retirado Recogida/Domicilio orders. Items are grouped
// so they stay distinguishable by type without duplicating a second big
// archive per queue -- the whole point is maximizing space for what's
// still active above this row.
const ListosArchivados = ({ retiradosTakeaway = [], servedSala = [] }) => {
  const [open, setOpen] = useState(false);
  // language-guard: allow-legacy existing backend field name (tipo_consegna), not new vocabulary
  const recogida = retiradosTakeaway.filter(o => o.tipo_consegna !== "DOMICILIO");
  // language-guard: allow-legacy existing backend field name (tipo_consegna), not new vocabulary
  const delivery = retiradosTakeaway.filter(o => o.tipo_consegna === "DOMICILIO");
  const total = servedSala.length + recogida.length + delivery.length;

  const sectionLabel = {
    fontSize: 10, fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase",
    color: "rgba(255,255,255,0.4)", margin: "10px 0 6px",
  };
  const rowStyle = {
    padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.03)",
    border: `1px solid ${C.fumo}`, marginBottom: 6, fontSize: 13, color: "rgba(255,255,255,0.75)",
  };

  return (
    <div style={{ marginTop: 16 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          background: C.carbone, border: `1px solid ${C.fumo}`, borderRadius: 12,
          padding: "10px 14px", cursor: "pointer", color: "#fff", fontWeight: 800, fontSize: 13,
        }}>
        <span>Archivados</span>
        <span style={{
          background: "rgba(255,255,255,0.10)", borderRadius: 20, padding: "1px 9px", fontSize: 12,
        }}>{total}</span>
        <span style={{ marginLeft: "auto", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>⌄</span>
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          <div style={sectionLabel}>Sala ({servedSala.length})</div>
          {servedSala.length === 0
            ? <div style={{ ...rowStyle, opacity: 0.6 }}>Nada todavía.</div>
            : servedSala.map(({ table, command }) => (
              <div key={command.id} style={rowStyle}>
                <strong>Mesa {table.number} · #{command.commandNumber}</strong>
                <div style={{ marginTop: 2, opacity: 0.8 }}>
                  {(command.items || []).map((item) => resolveItemProductNames(item).primary).filter(Boolean).join(", ") || "—"}
                </div>
              </div>
            ))}

          <div style={sectionLabel}>Recogida ({recogida.length})</div>
          {recogida.length === 0
            ? <div style={{ ...rowStyle, opacity: 0.6 }}>Nada todavía.</div>
            : recogida.map((o) => (
              <div key={o.id} style={rowStyle}>
                <strong>{formatOrderNumber(o)} · {o.nombre}</strong>
                <div style={{ marginTop: 2, opacity: 0.8 }}>
                  {(Array.isArray(o.items) ? o.items : []).map((item) => resolveItemProductNames(item).primary).filter(Boolean).join(", ") || "—"}
                </div>
              </div>
            ))}

          <div style={sectionLabel}>Delivery ({delivery.length})</div>
          {delivery.length === 0
            ? <div style={{ ...rowStyle, opacity: 0.6 }}>Nada todavía.</div>
            : delivery.map((o) => (
              <div key={o.id} style={rowStyle}>
                <strong>{formatOrderNumber(o)} · {o.nombre}</strong>
                <div style={{ marginTop: 2, opacity: 0.8 }}>
                  {(Array.isArray(o.items) ? o.items : []).map((item) => resolveItemProductNames(item).primary).filter(Boolean).join(", ") || "—"}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

export default ListosArchivados;

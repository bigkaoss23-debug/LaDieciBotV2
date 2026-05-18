import { useState } from 'react';
import { aplicarDescuento } from '../../constants';

// DescuentoInput — riutilizzabile in NuevoPedidoModal (creazione) e TabListos (RETIRADO).
// Controllato: tipo + valor vengono passati dal parent via props.
// Sorgente unica del calcolo: aplicarDescuento da constants.js (frontend) — il backend la rispecchia.
//
// Props:
//   tipo, valor          — stato corrente (controllato)
//   onChange(tipo, valor) — callback al cambio
//   totaleBase           — totale pre-sconto, per preview live
//   compact              — variante più stretta per uso inline (es. dentro popup RETIRADO)
//   theme                — "dark" (default) o "light" — adatta i colori
const DescuentoInput = ({ tipo, valor, onChange, totaleBase = 0, compact = false, theme = "dark" }) => {
  const [open, setOpen] = useState(!!(tipo && Number(valor) > 0));

  const isDark = theme !== "light";
  const colors = isDark
    ? {
        bg: "rgba(255,255,255,0.05)",
        border: "rgba(255,255,255,0.15)",
        text: "#fff",
        textDim: "rgba(255,255,255,0.6)",
        toggleActiveBg: "#F59E0B",
        toggleActiveText: "#fff",
        toggleInactiveBg: "rgba(255,255,255,0.08)",
        toggleInactiveText: "rgba(255,255,255,0.7)",
        inputBg: "rgba(0,0,0,0.25)",
        inputBorder: "rgba(255,255,255,0.2)",
        accent: "#F59E0B",
      }
    : {
        bg: "#FFF7E6",
        border: "#F59E0B",
        text: "#7C2D12",
        textDim: "#92400E",
        toggleActiveBg: "#D97706",
        toggleActiveText: "#fff",
        toggleInactiveBg: "#fff",
        toggleInactiveText: "#92400E",
        inputBg: "#fff",
        inputBorder: "#D97706",
        accent: "#D97706",
      };

  const { totale, importe } = aplicarDescuento(totaleBase, tipo, valor);

  const setTipo = (nuevoTipo) => {
    onChange(nuevoTipo, valor || 0);
  };
  const setValor = (nuevoValor) => {
    const num = Math.max(0, Number(nuevoValor) || 0);
    const cap = (tipo || "EURO") === "PERCENT" ? Math.min(num, 100) : num;
    onChange(tipo || "EURO", cap);
  };
  const limpiar = () => {
    onChange(null, 0);
  };

  // Stato chiuso: solo bottone "+ Descuento" o, se attivo, badge cliccabile con importo
  if (!open && (!tipo || Number(valor) <= 0)) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{
          background: "transparent",
          border: `1.5px dashed ${colors.border}`,
          color: colors.textDim,
          borderRadius: 10,
          padding: compact ? "6px 12px" : "8px 14px",
          fontSize: compact ? 12 : 13,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        + Aplicar descuento
      </button>
    );
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        background: colors.bg,
        border: `1.5px solid ${colors.border}`,
        borderRadius: 12,
        padding: compact ? "8px 10px" : "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: compact ? 6 : 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: colors.textDim, textTransform: "uppercase" }}>
          Descuento
        </div>
        <button
          type="button"
          onClick={() => { limpiar(); setOpen(false); }}
          style={{
            background: "transparent", border: "none",
            color: colors.textDim, fontSize: 11, fontWeight: 700,
            cursor: "pointer", padding: 0,
          }}
        >
          quitar
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
        {/* Toggle €/% */}
        <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${colors.inputBorder}` }}>
          {["EURO", "PERCENT"].map((t) => {
            const active = (tipo || "EURO") === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                style={{
                  background: active ? colors.toggleActiveBg : colors.toggleInactiveBg,
                  color:      active ? colors.toggleActiveText : colors.toggleInactiveText,
                  border: "none",
                  padding: "0 12px",
                  fontWeight: 900,
                  fontSize: 15,
                  fontFamily: "'DM Mono', monospace",
                  cursor: "pointer",
                  minWidth: 36,
                }}
              >
                {t === "EURO" ? "€" : "%"}
              </button>
            );
          })}
        </div>

        {/* Input numero */}
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step={(tipo || "EURO") === "PERCENT" ? "1" : "0.5"}
          max={(tipo || "EURO") === "PERCENT" ? "100" : undefined}
          value={Number(valor) || ""}
          onChange={(e) => setValor(e.target.value)}
          placeholder="0"
          style={{
            flex: 1,
            background: colors.inputBg,
            border: `1px solid ${colors.inputBorder}`,
            borderRadius: 8,
            padding: "6px 10px",
            color: colors.text,
            fontWeight: 800,
            fontSize: 16,
            fontFamily: "'DM Mono', monospace",
            outline: "none",
            minWidth: 60,
            textAlign: "right",
          }}
        />
      </div>

      {/* Preview live: Subtotal • Descuento • Total */}
      {importe > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: compact ? 11 : 12, fontFamily: "'DM Mono', monospace", color: colors.textDim }}>
          <span>Subtotal: <strong style={{ color: colors.text }}>{totaleBase.toFixed(2)}€</strong></span>
          <span>Descuento: <strong style={{ color: colors.accent }}>-{importe.toFixed(2)}€</strong></span>
          <span>Total: <strong style={{ color: colors.text, fontSize: compact ? 13 : 14 }}>{totale.toFixed(2)}€</strong></span>
        </div>
      )}
    </div>
  );
};

export default DescuentoInput;

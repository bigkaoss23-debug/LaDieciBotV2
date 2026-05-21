import { useState, useRef } from 'react';
import { api } from '../../api';
import { UI_OFFSET_STEP, UI_OFFSET_MAX } from '../../utils/uiOffset';

// Snooze visivo per ordine DOMICILIO in cucina.
// Click → +5 cumulativo (cap 20). Badge mostra totale corrente con pulse animation.
// "×" resetta a 0 (visibile solo se offset > 0).
//
// Props:
//   orden     — oggetto ordine completo (legge orden.id, orden.ui_offset_min)
//   onUpdate  — callback (orden_id, new_offset) per aggiornare lo state del parent
//               (l'app fa polling/WS, ma update ottimistico evita flicker)
const SnoozeButton = ({ orden, onUpdate }) => {
  const [pulse, setPulse]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [maxFlash, setMaxFlash] = useState(false);
  const pulseTimer = useRef(null);

  const current = Number(orden?.ui_offset_min) || 0;
  const hasOffset = current > 0;
  const atCap     = current >= UI_OFFSET_MAX;

  const triggerPulse = () => {
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    setPulse(true);
    pulseTimer.current = setTimeout(() => setPulse(false), 320);
  };

  const handleAdd = async (e) => {
    e.stopPropagation();
    if (saving) return;
    if (atCap) {
      setMaxFlash(true);
      setTimeout(() => setMaxFlash(false), 500);
      return;
    }
    const next = Math.min(UI_OFFSET_MAX, current + UI_OFFSET_STEP);
    triggerPulse();
    setSaving(true);
    onUpdate?.(orden.id, next); // ottimistico
    try {
      const res = await api.setUiOffset(orden.id, next);
      if (!res?._ok && res?.success !== true) {
        onUpdate?.(orden.id, current); // rollback
        console.warn('[SnoozeButton] setUiOffset failed', res);
      }
    } catch (err) {
      onUpdate?.(orden.id, current);
      console.warn('[SnoozeButton] setUiOffset error', err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (e) => {
    e.stopPropagation();
    if (saving || !hasOffset) return;
    setSaving(true);
    onUpdate?.(orden.id, 0); // ottimistico
    try {
      await api.setUiOffset(orden.id, 0);
    } catch (err) {
      onUpdate?.(orden.id, current);
      console.warn('[SnoozeButton] reset error', err);
    } finally {
      setSaving(false);
    }
  };

  // Stato neutro = bottone "tranquillo" (bordo grigio, testo scuro su bianco)
  // Stato attivo = bordo ambra leggero, fondo crema, testo scuro
  const bg     = hasOffset ? "#FEF3C7" : "#FFFFFF";
  const border = hasOffset ? "#D97706" : "#9CA3AF";
  const text   = hasOffset ? "#92400E" : "#374151";

  return (
    <div
      style={{
        display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
        userSelect: "none"
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <button
          onClick={handleAdd}
          disabled={saving}
          title={atCap ? `Max ${UI_OFFSET_MAX} min` : `+${UI_OFFSET_STEP} min`}
          style={{
            background: maxFlash ? "#FEE2E2" : bg,
            border: `1.5px solid ${maxFlash ? "#DC2626" : border}`,
            color: maxFlash ? "#7F1D1D" : text,
            borderRadius: 8,
            padding: "3px 9px",
            fontWeight: 800,
            fontSize: 13,
            fontFamily: "'DM Mono', monospace",
            cursor: saving ? "wait" : "pointer",
            display: "inline-flex", alignItems: "center",
            minWidth: 36,
            justifyContent: "center",
            transition: "background 0.15s, border-color 0.15s",
          }}
        >
          <span
            style={{
              display: "inline-block",
              transform: pulse ? "scale(1.8)" : "scale(1)",
              transition: "transform 0.32s cubic-bezier(.34,1.56,.64,1)",
              color: pulse ? "#D97706" : text,
            }}
          >
            {hasOffset ? `+${current}` : `+${UI_OFFSET_STEP}`}
          </span>
        </button>
        {hasOffset && (
          <button
            onClick={handleReset}
            disabled={saving}
            title="Cancelar snooze"
            style={{
              background: "transparent",
              border: "1px solid #9CA3AF",
              color: "#6B7280", borderRadius: "50%",
              width: 20, height: 20,
              padding: 0,
              fontWeight: 700, fontSize: 12, lineHeight: 1,
              cursor: saving ? "wait" : "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >×</button>
        )}
      </div>
      {atCap && (
        <div
          style={{
            color: "#92400E",
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1.15,
            maxWidth: 120,
          }}
        >
          Máximo +{UI_OFFSET_MAX} min. Usa × para reiniciar.
        </div>
      )}
    </div>
  );
};

export default SnoozeButton;

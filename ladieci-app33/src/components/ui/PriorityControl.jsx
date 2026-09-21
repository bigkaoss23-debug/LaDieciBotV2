import { useState, useEffect, useRef } from 'react';
import { api } from '../../api';
import { UI_OFFSET_MAX } from '../../utils/uiOffset';

// [FDV1] Priorità di produzione (ui_offset_min) per un pedido DOMICILIO o per un giro intero.
// `−` = adelantar, `+` = retrasar: un tap apre la scelta rapida dei minuti (valore ASSOLUTO, non cumulativo).
// Non crea orari visibili e non tocca mai la hora límite del cliente. In un giro il backend applica il valore a
// tutto il blocco (un PATCH): il controllo va mostrato UNA sola volta per giro.
export const PRIORITY_STEPS = [5, 10, 15, 20, 30].filter((m) => m <= UI_OFFSET_MAX);

const isCertainFailure = (res) => !!res && res._status >= 400 && res._status < 500;

const PriorityControl = ({ orden, onUpdate, label = null, light = false }) => {
  const [open, setOpen] = useState(null); // null | 'sub' | 'add'
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const rootRef = useRef(null);
  const current = Number(orden?.ui_offset_min) || 0;

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(null); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const apply = async (next) => {
    setOpen(null);
    if (saving || next === current) return;
    setSaving(true); setFailed(false);
    onUpdate?.(orden.id, next); // ottimistico (TabCocina lo tiene ~8 s, poi vince il dato realtime)
    try {
      const res = await api.setUiOffset(orden.id, next);
      if (!(res?._ok || res?.success === true)) {
        // errore certo → rollback; esito incerto (rete/5xx) → nessun rollback: decide il dato realtime
        if (isCertainFailure(res)) onUpdate?.(orden.id, current);
        setFailed(true);
      }
    } catch (err) {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const ink = light ? '#1F2937' : '#FFFFFF';
  const btn = {
    minWidth: 38, height: 34, borderRadius: 9, fontSize: 20, fontWeight: 900, lineHeight: 1,
    border: `1.5px solid ${light ? '#9CA3AF' : 'rgba(255,255,255,0.55)'}`,
    background: light ? '#FFFFFF' : 'rgba(0,0,0,0.25)', color: ink,
    cursor: saving ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
  const chip = current !== 0 ? `${current > 0 ? '+' : '−'}${Math.abs(current)} min` : null;

  return (
    <div ref={rootRef} onClick={(e) => e.stopPropagation()} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {label && <span style={{ fontSize: 11, fontWeight: 900, color: light ? '#92400E' : '#FDE68A' }}>{label}</span>}
      <button type="button" aria-label="Adelantar" title="Adelantar" disabled={saving} style={btn}
        onClick={() => setOpen(open === 'sub' ? null : 'sub')}>−</button>
      {chip && (
        <span data-testid="priority-chip" style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 900,
          color: light ? '#92400E' : '#FDE68A', background: light ? '#FEF3C7' : 'rgba(251,191,36,0.18)',
          borderRadius: 7, padding: '3px 7px' }}>{chip}</span>
      )}
      <button type="button" aria-label="Retrasar" title="Retrasar" disabled={saving} style={btn}
        onClick={() => setOpen(open === 'add' ? null : 'add')}>+</button>
      {failed && <span title="Prioridad sin confirmar" style={{ color: '#DC2626', fontWeight: 900 }}>!</span>}
      {open && (
        <div role="menu" style={{ position: 'absolute', top: 40, left: 0, zIndex: 50, display: 'flex', flexDirection: 'column', gap: 6,
          background: '#FFFFFF', border: '1.5px solid #9CA3AF', borderRadius: 10, padding: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.3)' }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: '#374151' }}>{open === 'sub' ? 'Adelantar' : 'Retrasar'}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {PRIORITY_STEPS.map((m) => {
              const v = open === 'sub' ? -m : m;
              return (
                <button key={m} type="button" role="menuitem" onClick={() => apply(v)}
                  style={{ minWidth: 44, height: 40, borderRadius: 8, fontSize: 15, fontWeight: 900, cursor: 'pointer',
                    border: `1.5px solid ${v === current ? '#D97706' : '#D1D5DB'}`, background: v === current ? '#FEF3C7' : '#F9FAFB', color: '#111827' }}>
                  {m}
                </button>
              );
            })}
          </div>
          {current !== 0 && (
            <button type="button" role="menuitem" onClick={() => apply(0)}
              style={{ height: 36, borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer',
                border: '1.5px solid #D1D5DB', background: '#FFFFFF', color: '#374151' }}>Sin prioridad</button>
          )}
        </div>
      )}
    </div>
  );
};

export default PriorityControl;

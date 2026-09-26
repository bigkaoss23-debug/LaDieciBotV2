import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api';
import { PRIORITY_STEPS_ALL } from '../../utils/uiOffset';
import usePriorityContract from './usePriorityContract';
import { maxPlusMinutes } from '../cocina/manualGiroCocina';

// [FDV1 R3] Priorità di produzione (ui_offset_min): sposta la card (o l'intero giro) avanti / indietro nella CODA DI
// PRODUZIONE. Non ritarda la consegna: hora, delivery_deadline_at, timestamp e promessa al cliente non cambiano mai.
//   − = adelantar (prima nella coda) · + = retrasar (dopo nella coda). I bottoni non portano minuti: un tap apre la
//   scelta rapida 5 · 10 · 15 · 20 · 30 · 40 · 50 (valore ASSOLUTO), limitata dal contratto del backend.
//   + oltre la finestra sicura (HORA LÍMITE più urgente − margine URGENTE; giro = membro più urgente) → disabilitato.
//   Ridurre un + già applicato è sempre possibile.
// In un giro il backend applica il valore a tutto il blocco: il controllo va mostrato UNA sola volta per giro.
// Il menu 5…50 è renderizzato in un portal su document.body con position:fixed: gli header KDS (BlockHeader 88px,
// card, GiroGroup) hanno overflow:hidden e lo taglierebbero. Posizione = la stessa di prima (46px sotto i bottoni),
// ribaltata sopra se non c'è spazio in basso, sempre dentro il viewport.

const MENU_TOP = 46;   // = vecchio `top: 46` relativo al controllo
const EDGE = 8;

const isSaved = (res) => !!res && res.success === true;
const isCertainRefusal = (res) => !!res && (res.error === "offset_exceeds_window"
  || (Number(res.status) >= 400 && Number(res.status) < 500) || (Number(res._status) >= 400 && Number(res._status) < 500));

export const priorityOptions = ({ dir, current, maxPlus, contract }) => {
  const lim = dir === "sub" ? Math.abs(Number(contract.min) || 0) : Number(contract.max) || 0;
  return PRIORITY_STEPS_ALL.filter((m) => m <= lim).map((m) => {
    const value = dir === "sub" ? -m : m;
    const allowed = dir === "sub" ? true : (m <= maxPlus || value < current);
    return { minutes: m, value, allowed };
  });
};

const PriorityControl = ({ orden, windowOrders = null, onUpdate, light = false, nowMs = null }) => {
  const contract = usePriorityContract();
  const [open, setOpen] = useState(null); // null | 'sub' | 'add'
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const current = Number(orden?.ui_offset_min) || 0;

  useEffect(() => {
    if (!open) return undefined;
    // il menu non è più un discendente DOM del controllo (portal): anche lui conta come "dentro"
    const close = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target) && !(menuRef.current && menuRef.current.contains(e.target))) setOpen(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  // aggancia il menu (fixed) ai bottoni: a ogni render mentre è aperto (la card può spostarsi nella coda), su
  // scroll di qualsiasi contenitore e su resize/rotazione del tablet. Scrive solo lo style: nessun re-render.
  const placeMenu = () => {
    const root = rootRef.current, menu = menuRef.current;
    if (!root || !menu) return;
    const r = root.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    const left = Math.max(EDGE, Math.min(r.left, vw - mw - EDGE));
    let top = r.top + MENU_TOP;
    if (top + mh > vh - EDGE && r.top - (MENU_TOP - r.height) - mh >= EDGE) top = r.top - (MENU_TOP - r.height) - mh;
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.visibility = r.bottom < 0 || r.top > vh ? 'hidden' : 'visible';   // controllo scrollato fuori schermo
  };
  useLayoutEffect(() => { if (open) placeMenu(); });
  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    return () => { window.removeEventListener('resize', placeMenu); window.removeEventListener('scroll', placeMenu, true); };
  }, [open]);

  const maxPlus = maxPlusMinutes(windowOrders && windowOrders.length ? windowOrders : [orden],
    Number.isFinite(nowMs) ? nowMs : Date.now(), contract);

  const apply = async (next) => {
    setOpen(null);
    if (saving || next === current) return;
    setSaving(true); setNote(null);
    onUpdate?.(orden.id, next); // ottimistico (Cocina/Pizzeria lo tengono ~8 s, poi vince il dato realtime)
    try {
      const res = await api.setUiOffset(orden.id, next);
      if (!isSaved(res)) {
        if (isCertainRefusal(res)) {
          onUpdate?.(orden.id, current);           // rifiuto certo → rollback
          setNote(res && res.error === "offset_exceeds_window" ? `Máx. +${Number(res.max_allowed) || 0} ahora` : "No aplicado");
        } else {
          setNote("Sin confirmar");                 // esito incerto → nessun rollback: decide il dato realtime
        }
      }
    } catch (err) {
      setNote("Sin confirmar");
    } finally {
      setSaving(false);
    }
  };

  const ink = light ? '#111827' : '#FFFFFF';
  const btn = {
    minWidth: 44, height: 40, borderRadius: 10, fontSize: 24, fontWeight: 900, lineHeight: 1,
    border: `2px solid ${light ? '#6B7280' : 'rgba(255,255,255,0.7)'}`,
    background: light ? '#FFFFFF' : 'rgba(0,0,0,0.3)', color: ink,
    cursor: saving ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
  const chip = current !== 0 ? `${current > 0 ? '+' : '−'}${Math.abs(current)}` : null;
  const opts = open ? priorityOptions({ dir: open, current, maxPlus, contract }) : [];

  return (
    <div ref={rootRef} onClick={(e) => e.stopPropagation()} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button type="button" aria-label="Adelantar en la cola" title="Adelantar en la cola de producción" disabled={saving} style={btn}
        onClick={() => setOpen(open === 'sub' ? null : 'sub')}>−</button>
      {chip && (
        <span data-testid="priority-chip" title="Posición en la cola (no cambia la hora límite)" style={{ fontFamily: "'DM Mono',monospace", fontSize: 14, fontWeight: 900,
          color: light ? '#92400E' : '#FDE68A', background: light ? '#FEF3C7' : 'rgba(251,191,36,0.22)', borderRadius: 7, padding: '4px 7px' }}>{chip}</span>
      )}
      <button type="button" aria-label="Retrasar en la cola" title="Retrasar en la cola de producción" disabled={saving} style={btn}
        onClick={() => setOpen(open === 'add' ? null : 'add')}>+</button>
      {note && <span role="status" style={{ color: light ? '#B91C1C' : '#FCA5A5', fontWeight: 900, fontSize: 12 }}>{note}</span>}
      {open && createPortal(
        <div ref={menuRef} role="menu" style={{ position: 'fixed', top: 0, left: 0, zIndex: 9000, display: 'flex', flexDirection: 'column', gap: 8,
          background: '#FFFFFF', border: '2px solid #6B7280', borderRadius: 12, padding: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.35)', minWidth: 260 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#111827' }}>{open === 'sub' ? 'Adelantar en la cola (min)' : 'Retrasar en la cola (min)'}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {opts.map((op) => (
              <button key={op.minutes} type="button" role="menuitem" disabled={!op.allowed} aria-disabled={!op.allowed}
                onClick={() => op.allowed && apply(op.value)}
                style={{ minWidth: 46, height: 44, borderRadius: 9, fontSize: 16, fontWeight: 900,
                  cursor: op.allowed ? 'pointer' : 'not-allowed', opacity: op.allowed ? 1 : 0.35,
                  border: `2px solid ${op.value === current ? '#D97706' : '#D1D5DB'}`,
                  background: op.value === current ? '#FEF3C7' : '#F9FAFB', color: '#111827' }}>
                {op.minutes}
              </button>
            ))}
          </div>
          {open === 'add' && opts.some((op) => !op.allowed) && (
            <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E' }}>Máx. +{maxPlus} ahora (hora límite cerca)</div>
          )}
          {current !== 0 && (
            <button type="button" role="menuitem" onClick={() => apply(0)}
              style={{ height: 38, borderRadius: 9, fontSize: 13, fontWeight: 800, cursor: 'pointer',
                border: '2px solid #D1D5DB', background: '#FFFFFF', color: '#374151' }}>Sin prioridad</button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

export default PriorityControl;

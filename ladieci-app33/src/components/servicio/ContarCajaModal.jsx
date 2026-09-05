import { useState, useEffect, useCallback } from 'react';
import { C } from '../../constants';
import { economyApi, createEconomyRequestId, EconomyApiError } from '../../economy/economyApi';

// ===============================================================
// ContarCajaModal — the OPERATIONAL cash count.
//
// An operator opens the drawer, counts the notes and coins, and records what
// was physically there RIGHT NOW. That is all it does.
//
// IT IS NOT A CLOSE, and the STRUCTURE says so — not a helper sentence: this
// is its own control, separate from "Finalizar servicio", it exposes no
// lifecycle transition, and its history rows expose no edit/delete. No
// "cierre" / "cerrar" / "finalizar" / "fin de servicio" vocabulary appears
// anywhere in this component, and a static test fails the build if it does.
//
// IT COUNTS NOW, ONLY NOW. There is deliberately no period/preset selector:
// you cannot physically count yesterday's drawer. The request is always
// `preset: 'hoy'` and carries NO service id — the backend resolves the current
// Operational Service itself and stamps the count's provenance. The frontend
// does not decide which service this belongs to.
//
// HONEST MONEY WORDING. The comparison figure is "efectivo registrado" — cash
// RECEIPTS RECORDED so far today — not "efectivo esperado en caja": this system
// models no opening float, no deposits, no withdrawals and no tips, so it
// cannot know what the drawer *should* hold. "Diferencia" is the plain
// arithmetic difference and nothing more.
// ===============================================================

const eur = (value) => `${(Number(value) || 0).toFixed(2).replace('.', ',')} €`;
const clock = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', hour12: false,
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(d);
};

const ERROR_COPY = {
  ECONOMY_UNAUTHENTICATED: 'Tu sesión ha caducado. Vuelve a entrar.',
  ECONOMY_SESSION_STALE: 'Tu sesión ha caducado. Vuelve a entrar.',
  ECONOMY_READ_FORBIDDEN: 'Tu perfil no tiene acceso a la economía.',
  ECONOMY_CASH_COUNT_FORBIDDEN: 'Tu perfil no puede registrar conteos de caja.',
  ECONOMY_CASH_COUNT_INVALID: 'Escribe el efectivo contado como un número.',
  ECONOMY_CASH_COUNT_OUT_OF_RANGE: 'Ese importe no es válido.',
  ECONOMY_NETWORK_ERROR: 'Sin conexión con el servidor. Inténtalo de nuevo.',
};
const describeError = (error) => {
  const code = error instanceof EconomyApiError ? error.code : null;
  return (code && ERROR_COPY[code]) || 'No se ha podido completar la operación. Inténtalo de nuevo.';
};

const varianceTone = (value) => (value === 0 ? C.verde : value > 0 ? C.blu : C.orange);

export default function ContarCajaModal({ onClose }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [justSaved, setJustSaved] = useState(null);
  const [history, setHistory] = useState([]);

  // Always the current operating day. No selector: a physical count is a
  // fact about NOW.
  const load = useCallback(async () => {
    setLoadError(null);
    try { setSnapshot(await economyApi.snapshot({ preset: 'hoy' })); }
    catch (e) { setSnapshot(null); setLoadError(describeError(e)); }
  }, []);
  const loadHistory = useCallback(async () => {
    try { setHistory((await economyApi.listCashCounts({ preset: 'hoy' })).counts || []); }
    catch (_) { /* history is context, never the point of the screen */ }
  }, []);
  useEffect(() => { load(); loadHistory(); }, [load, loadHistory]);

  const cashRecorded = snapshot ? snapshot.receipts.byMethod.efectivo : 0;
  const countedNumber = counted === '' ? null : Number(String(counted).replace(',', '.'));
  const countedValid = countedNumber !== null && Number.isFinite(countedNumber) && countedNumber >= 0;
  const liveVariance = countedValid ? Math.round((countedNumber - cashRecorded) * 100) / 100 : null;

  const confirm = async () => {
    if (!countedValid || !snapshot || saving) return;
    setSaving(true); setSaveError(null);
    try {
      const out = await economyApi.createCashCount({
        preset: 'hoy',
        countedCash: countedNumber,
        note: note.trim() || undefined,
        clientRequestId: createEconomyRequestId('cash'),
      });
      setJustSaved(out.count);
      setCounted(''); setNote('');
      await loadHistory();
    } catch (e) { setSaveError(describeError(e)); }
    finally { setSaving(false); }
  };

  const box = { background: C.carbone, border: `1px solid ${C.fumo}`, borderRadius: 14, padding: 16 };

  return (
    <div data-testid="contar-caja-modal" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#1a1a2e', border: '1.5px solid rgba(255,255,255,0.13)', borderRadius: 20,
        padding: 22, maxWidth: 420, width: '100%', maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 8px 40px rgba(0,0,0,0.7)', display: 'grid', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ color: '#fff', fontSize: 18, fontWeight: 900, flex: 1 }}>Contar caja</div>
          <button type="button" data-testid="contar-caja-close" onClick={onClose} style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
            color: 'rgba(255,255,255,0.6)', borderRadius: 10, width: 32, height: 32,
            fontSize: 16, cursor: 'pointer',
          }}>×</button>
        </div>

        {loadError && (
          <div data-testid="contar-caja-load-error" style={{ ...box, borderColor: C.rossoV, color: C.rosso, fontSize: 12.5 }}>
            {loadError}
          </div>
        )}

        <div style={{ ...box, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ minWidth: 150, flex: '1 1 150px' }}>
            <div style={{ color: C.grigio, fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
              Efectivo registrado hoy
            </div>
            <div data-testid="contar-caja-recorded" style={{ color: C.bianco, fontSize: 20, fontWeight: 800 }}>{eur(cashRecorded)}</div>
            <div style={{ color: C.grigio, fontSize: 11, marginTop: 3 }}>Cobros en efectivo del día operativo.</div>
          </div>
          {liveVariance !== null && (
            <div style={{ minWidth: 110, flex: '1 1 110px' }}>
              <div style={{ color: C.grigio, fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                Diferencia
              </div>
              <div data-testid="contar-caja-variance-preview" style={{ color: varianceTone(liveVariance), fontSize: 20, fontWeight: 800 }}>
                {eur(liveVariance)}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <label style={{ color: C.grigio, fontSize: 11 }}>
            Efectivo contado<br />
            <input
              data-testid="contar-caja-input"
              inputMode="decimal"
              placeholder="0,00"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              style={{ background: C.carbone2, color: C.bianco, border: `1px solid ${C.fumo}`, borderRadius: 8, padding: '9px 11px', marginTop: 4, width: 130, fontSize: 15, fontWeight: 700 }}
            />
          </label>
          <label style={{ color: C.grigio, fontSize: 11, flex: '1 1 180px' }}>
            Nota (opcional)<br />
            <input
              data-testid="contar-caja-note"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ background: C.carbone2, color: C.bianco, border: `1px solid ${C.fumo}`, borderRadius: 8, padding: '9px 11px', marginTop: 4, width: '100%' }}
            />
          </label>
        </div>

        <button
          type="button"
          data-testid="contar-caja-confirm"
          onClick={confirm}
          disabled={!countedValid || saving || !snapshot}
          style={{
            background: countedValid && !saving && snapshot ? C.avana : C.fumo,
            color: countedValid && !saving && snapshot ? C.nero : C.grigio,
            border: 'none', borderRadius: 12, padding: '13px 20px',
            fontSize: 13.5, fontWeight: 800,
            cursor: countedValid && !saving && snapshot ? 'pointer' : 'not-allowed',
          }}
        >{saving ? 'Guardando…' : 'Registrar conteo'}</button>

        {saveError && <div data-testid="contar-caja-error" style={{ color: C.rosso, fontSize: 12 }}>{saveError}</div>}
        {justSaved && (
          <div data-testid="contar-caja-saved" style={{ color: C.verde, fontSize: 12 }}>
            Conteo registrado: contado {eur(justSaved.countedCash)} · registrado {eur(justSaved.recordedCashReceipts)} · diferencia {eur(justSaved.variance)}.
          </div>
        )}

        {history.length > 0 && (
          <div style={box}>
            <div style={{ color: C.grigio, fontSize: 11, letterSpacing: 1, marginBottom: 10 }}>CONTEOS DE HOY</div>
            <div data-testid="contar-caja-history" style={{ display: 'grid', gap: 8 }}>
              {history.map((row) => (
                <div key={row.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline', borderTop: `1px solid ${C.fumo}`, paddingTop: 8 }}>
                  <span style={{ color: C.bianco, fontSize: 12, fontWeight: 700 }}>{clock(row.countedAt)}</span>
                  <span style={{ color: C.grigio, fontSize: 12 }}>{row.actor}</span>
                  <span style={{ color: C.bianco, fontSize: 12 }}>contado {eur(row.countedCash)}</span>
                  <span style={{ color: C.grigio, fontSize: 12 }}>registrado {eur(row.recordedCashReceipts)}</span>
                  <span style={{ color: varianceTone(row.variance), fontSize: 12, fontWeight: 700 }}>{eur(row.variance)}</span>
                  {row.note ? <span style={{ color: C.grigio, fontSize: 11, fontStyle: 'italic' }}>{row.note}</span> : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

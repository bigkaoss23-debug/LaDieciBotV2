import { useState, useEffect, useCallback } from 'react';
import { economyApi, createEconomyRequestId, EconomyApiError } from '../../economy/economyApi';
// VISUAL CONSISTENCY PASS 1 — Mesa's shared surface tokens. Presentation
// only: the request, the parsing and the append-only history are untouched.
import * as MS from '../ui/mesaSurface';

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

const varianceTone = (value) => (value === 0 ? MS.ACCENT.positive : value > 0 ? MS.ACCENT.refund : MS.ACCENT.warn);

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

  // VISUAL CONSISTENCY PASS 1 — Mesa modal language. Every figure, request
  // and validation below is unchanged; what changed is that the whole sheet
  // used to sit at C.grigio (#666) on C.carbone (#0E0E0E) — grey on grey —
  // with a disabled Confirmar rendered as C.fumo-on-C.grigio, which reads as
  // broken rather than "not yet". Labels are now readable, the two amounts
  // that matter carry real weight, and the disabled button has its own
  // deliberate state.
  const canConfirm = countedValid && !saving && !!snapshot;
  const fieldLabel = { display: 'block', color: MS.TEXT.label, fontSize: 12, fontWeight: 800, marginBottom: 6 };
  const input = {
    width: '100%', boxSizing: 'border-box',
    background: MS.SURFACE.inputBg, color: MS.TEXT.strong,
    border: '1px solid rgba(208,184,145,.3)', borderRadius: 11,
    padding: '12px 13px', font: 'inherit', outline: 'none',
  };

  return (
    <div data-testid="contar-caja-modal" style={MS.overlay}>
      <div style={MS.sheet(420)}>
        <div style={MS.sheetHead}>
          <span style={MS.sheetTitle}>
            <MS.MesaIcon d={MS.ICON_CASH_DRAWER} size={19} style={{ color: MS.ACCENT.gold }} />
            Contar caja
          </span>
          <button type="button" data-testid="contar-caja-close" onClick={onClose}
            aria-label="Cerrar" style={MS.closeButton}>×</button>
        </div>

        <div style={MS.sheetBody}>
          {loadError && (
            <div data-testid="contar-caja-load-error" style={{
              ...MS.card(), borderColor: 'rgba(232,52,28,.5)', background: 'rgba(232,52,28,.1)',
              color: MS.ACCENT.danger, fontSize: 12.5, lineHeight: 1.45,
            }}>
              {loadError}
            </div>
          )}

          <div style={{ ...MS.card(true), display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ minWidth: 140, flex: '1 1 140px' }}>
              <div style={{ ...MS.eyebrow(true), marginBottom: 5 }}>Efectivo registrado hoy</div>
              <div data-testid="contar-caja-recorded" style={{
                color: MS.TEXT.goldStrong, fontSize: 24, fontWeight: 950,
                letterSpacing: '-.3px', fontVariantNumeric: 'tabular-nums',
              }}>{eur(cashRecorded)}</div>
              <div style={{ color: MS.TEXT.muted, fontSize: 11.5, marginTop: 4 }}>Cobros en efectivo del día operativo.</div>
            </div>
            {liveVariance !== null && (
              <div style={{ minWidth: 110, flex: '1 1 110px' }}>
                <div style={{ ...MS.eyebrow(false), marginBottom: 5 }}>Diferencia</div>
                <div data-testid="contar-caja-variance-preview" style={{
                  color: varianceTone(liveVariance), fontSize: 24, fontWeight: 950,
                  letterSpacing: '-.3px', fontVariantNumeric: 'tabular-nums',
                }}>
                  {eur(liveVariance)}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
            <label style={{ flex: '0 0 138px' }}>
              <span style={fieldLabel}>Efectivo contado</span>
              <input
                data-testid="contar-caja-input"
                inputMode="decimal"
                placeholder="0,00"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                style={{ ...input, fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}
              />
            </label>
            <label style={{ flex: '1 1 170px', minWidth: 0 }}>
              <span style={fieldLabel}>Nota (opcional)</span>
              <input
                data-testid="contar-caja-note"
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={input}
              />
            </label>
          </div>

          <button
            type="button"
            data-testid="contar-caja-confirm"
            onClick={confirm}
            disabled={!canConfirm}
            style={MS.button({ tone: 'gold', size: 'lg', full: true, disabled: !canConfirm })}
          >{saving ? 'Guardando…' : 'Registrar conteo'}</button>

          {saveError && <div data-testid="contar-caja-error" style={{ color: MS.ACCENT.danger, fontSize: 12.5, lineHeight: 1.45 }}>{saveError}</div>}
          {justSaved && (
            <div data-testid="contar-caja-saved" style={{ color: MS.ACCENT.positive, fontSize: 12.5, lineHeight: 1.5 }}>
              Conteo registrado: contado {eur(justSaved.countedCash)} · registrado {eur(justSaved.recordedCashReceipts)} · diferencia {eur(justSaved.variance)}.
            </div>
          )}

          {history.length > 0 && (
            <div style={MS.card()}>
              <div style={{ ...MS.eyebrow(false), marginBottom: 9 }}>Conteos de hoy</div>
              <div data-testid="contar-caja-history" style={{ display: 'grid' }}>
                {history.map((row, i) => (
                  <div key={row.id} style={{
                    display: 'flex', flexWrap: 'wrap', gap: 9, alignItems: 'baseline',
                    borderTop: i === 0 ? 'none' : MS.LINE.row, padding: '8px 0',
                  }}>
                    <span style={{ color: MS.TEXT.strong, fontSize: 12.5, fontWeight: 800 }}>{clock(row.countedAt)}</span>
                    <span style={{ color: MS.TEXT.muted, fontSize: 12 }}>{row.actor}</span>
                    <span style={{ color: MS.TEXT.value, fontSize: 12.5 }}>contado {eur(row.countedCash)}</span>
                    <span style={{ color: MS.TEXT.muted, fontSize: 12 }}>registrado {eur(row.recordedCashReceipts)}</span>
                    <span style={{ color: varianceTone(row.variance), fontSize: 12.5, fontWeight: 800, marginLeft: 'auto' }}>{eur(row.variance)}</span>
                    {row.note ? <span style={{ color: MS.TEXT.muted, fontSize: 11.5, fontStyle: 'italic', flexBasis: '100%' }}>{row.note}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback, useMemo } from 'react';
import { C } from '../../constants';
import { economyApi, createEconomyRequestId, EconomyApiError } from '../../economy/economyApi';

// ===============================================================
// EconomiaSnapshotPanel — I-1
//
// Two things live here, and the copy works hard to keep them apart:
//
//   1. A READ-ONLY window on the economy. Pick an interval, see what it holds.
//      Nothing on this half of the panel writes anything, anywhere.
//   2. A PHYSICAL CASH COUNT. Type what is actually in the drawer, confirm,
//      and it is recorded — appended, attributed and timestamped.
//
// NEITHER IS "FINALIZAR SERVICIO", and the words on screen say so out loud.
// This product has already burned an operator once by letting a read-only
// report titled "Cierre del servicio" read as a completed close (forensic
// audit of service 480eca89, 2026-08-21 — the owner reasonably believed the
// evening had been finalized; zero closeout attempts had ever been recorded).
// So: no "cierre", no "cerrar", no "finalizar", no "fin de servicio" anywhere
// in this component, an explicit standing note that counting changes nothing,
// and a static test that fails the build if any of that vocabulary reappears.
//
// HONEST MONEY WORDING. The comparison figure is "Efectivo registrado en el
// período" — cash RECEIPTS RECORDED in the window. It is NOT called "efectivo
// esperado en caja", because this system models no opening float, no deposits,
// no withdrawals, no petty cash and no tips, and therefore genuinely cannot
// know what the drawer should physically hold. The difference is labelled
// "Diferencia", never "descuadre" or "faltante", which would assert a fault
// the data does not support.
// ===============================================================

const PRESETS = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'ayer', label: 'Ayer' },
  { key: 'mediodia', label: 'Mediodía' },
  { key: 'noche', label: 'Noche' },
  { key: 'personalizado', label: 'Personalizado' },
];

const eur = (value) => `${(Number(value) || 0).toFixed(2).replace('.', ',')} €`;

const clock = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
};

// The browser's own local ISO minute, for the two datetime-local inputs.
const localInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const ERROR_COPY = {
  ECONOMY_UNAUTHENTICATED: 'Tu sesión ha caducado. Vuelve a entrar.',
  ECONOMY_SESSION_STALE: 'Tu sesión ha caducado. Vuelve a entrar.',
  ECONOMY_READ_FORBIDDEN: 'Tu perfil no tiene acceso a la economía.',
  ECONOMY_CASH_COUNT_FORBIDDEN: 'Tu perfil no puede registrar conteos de caja.',
  ECONOMY_WINDOW_NOT_ORDERED: 'El final del período debe ser posterior al inicio.',
  ECONOMY_WINDOW_TOO_WIDE: 'El período seleccionado es demasiado amplio.',
  ECONOMY_WINDOW_FROM_INVALID: 'La fecha de inicio no es válida.',
  ECONOMY_WINDOW_TO_INVALID: 'La fecha de fin no es válida.',
  ECONOMY_CASH_COUNT_INVALID: 'Escribe el efectivo contado como un número.',
  ECONOMY_CASH_COUNT_OUT_OF_RANGE: 'Ese importe no es válido.',
  ECONOMY_NETWORK_ERROR: 'Sin conexión con el servidor. Inténtalo de nuevo.',
};
const describeEconomyError = (error) => {
  const code = error instanceof EconomyApiError ? error.code : null;
  return (code && ERROR_COPY[code]) || 'No se ha podido completar la operación. Inténtalo de nuevo.';
};

const box = {
  background: C.carbone,
  border: `1px solid ${C.fumo}`,
  borderRadius: 14,
  padding: 18,
};

export function Metric({ label, value, tone = C.bianco, hint = null, testId }) {
  return (
    <div data-testid={testId} style={{ minWidth: 128, flex: '1 1 128px' }}>
      <div style={{ color: C.grigio, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ color: tone, fontSize: 20, fontWeight: 800 }}>{value}</div>
      {hint ? <div style={{ color: C.grigio, fontSize: 11, marginTop: 3 }}>{hint}</div> : null}
    </div>
  );
}

export default function EconomiaSnapshotPanel() {
  const [preset, setPreset] = useState('hoy');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [justSaved, setJustSaved] = useState(null);
  const [history, setHistory] = useState([]);

  const windowArgs = useMemo(() => (
    preset === 'personalizado'
      ? { preset, from: from ? new Date(from).toISOString() : '', to: to ? new Date(to).toISOString() : '' }
      : { preset }
  ), [preset, from, to]);

  const load = useCallback(async () => {
    if (preset === 'personalizado' && (!from || !to)) { setSnapshot(null); return; }
    setLoading(true); setError(null);
    try {
      setSnapshot(await economyApi.snapshot(windowArgs));
    } catch (e) {
      setSnapshot(null); setError(describeEconomyError(e));
    } finally { setLoading(false); }
  }, [preset, from, to, windowArgs]);

  const loadHistory = useCallback(async () => {
    try { setHistory((await economyApi.listCashCounts({ limit: 10 })).counts || []); }
    catch (_) { /* history is context, never the point of the screen */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const cashRecorded = snapshot ? snapshot.receipts.byMethod.efectivo : 0;
  const countedNumber = counted === '' ? null : Number(String(counted).replace(',', '.'));
  const countedValid = countedNumber !== null && Number.isFinite(countedNumber) && countedNumber >= 0;
  const liveVariance = countedValid ? Math.round((countedNumber - cashRecorded) * 100) / 100 : null;

  const confirm = async () => {
    if (!countedValid || !snapshot || saving) return;
    setSaving(true); setSaveError(null);
    try {
      const out = await economyApi.createCashCount({
        ...windowArgs,
        countedCash: countedNumber,
        note: note.trim() || undefined,
        clientRequestId: createEconomyRequestId('cash'),
      });
      setJustSaved(out.count);
      setCounted(''); setNote('');
      await loadHistory();
    } catch (e) { setSaveError(describeEconomyError(e)); }
    finally { setSaving(false); }
  };

  const varianceTone = (value) => (value === 0 ? C.verde : value > 0 ? C.blu : C.orange);

  return (
    <div data-testid="economia-snapshot-panel" style={{ display: 'grid', gap: 16, marginTop: 20 }}>

      {/* ── WINDOW ─────────────────────────────────────────────────── */}
      <div style={box}>
        <div style={{ color: C.bianco, fontSize: 14, fontWeight: 800, letterSpacing: 1, marginBottom: 4 }}>
          RESUMEN ECONÓMICO
        </div>
        <div data-testid="snapshot-read-only-note" style={{ color: C.grigio, fontSize: 12, marginBottom: 14 }}>
          Solo consulta. Elegir un período no modifica ningún pedido, ningún cobro y ningún servicio.
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              data-testid={`preset-${p.key}`}
              onClick={() => {
                // Seed the custom range from whatever is currently on screen,
                // so "Personalizado" opens on the window the operator was just
                // looking at. Done HERE, in the one click that needs it, and
                // never from the response: seeding after every load fed from/to
                // straight back into this effect's dependencies and fired a
                // second, identical request each time.
                if (p.key === 'personalizado' && snapshot) {
                  setFrom(localInput(snapshot.window.from));
                  setTo(localInput(snapshot.window.to));
                }
                setPreset(p.key);
              }}
              style={{
                background: preset === p.key ? C.avana : 'transparent',
                color: preset === p.key ? C.nero : C.bianco,
                border: `1px solid ${preset === p.key ? C.avana : C.fumo}`,
                borderRadius: 999, padding: '7px 14px',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >{p.label}</button>
          ))}
        </div>

        {preset === 'personalizado' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
            <label style={{ color: C.grigio, fontSize: 11 }}>
              Desde<br />
              <input data-testid="custom-from" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)}
                style={{ background: C.carbone2, color: C.bianco, border: `1px solid ${C.fumo}`, borderRadius: 8, padding: '7px 9px', marginTop: 4 }} />
            </label>
            <label style={{ color: C.grigio, fontSize: 11 }}>
              Hasta<br />
              <input data-testid="custom-to" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)}
                style={{ background: C.carbone2, color: C.bianco, border: `1px solid ${C.fumo}`, borderRadius: 8, padding: '7px 9px', marginTop: 4 }} />
            </label>
          </div>
        )}

        {snapshot && (
          <div data-testid="window-range" style={{ color: C.grigio, fontSize: 11, marginTop: 12 }}>
            {clock(snapshot.window.from)} → {clock(snapshot.window.to)} · hora de Madrid
          </div>
        )}
      </div>

      {/* ── WHAT THE WINDOW HOLDS ──────────────────────────────────── */}
      {loading && <div style={{ ...box, color: C.grigio, fontSize: 13 }}>Cargando…</div>}
      {error && <div data-testid="snapshot-error" style={{ ...box, borderColor: C.rossoV, color: C.rosso, fontSize: 13 }}>{error}</div>}

      {snapshot && !loading && (
        <>
          <div style={box}>
            <div style={{ color: C.grigio, fontSize: 11, letterSpacing: 1, marginBottom: 12 }}>
              COBRADO EN EL PERÍODO
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <Metric testId="m-collected" label="Total cobrado" value={eur(snapshot.receipts.collected)} tone={C.verde} />
              <Metric testId="m-cash" label="Efectivo" value={eur(snapshot.receipts.byMethod.efectivo)} />
              <Metric testId="m-card" label="Tarjeta" value={eur(snapshot.receipts.byMethod.tarjeta)} />
              <Metric testId="m-bizum" label="Bizum" value={eur(snapshot.receipts.byMethod.bizum)} />
              <Metric testId="m-other" label="Otros" value={eur(snapshot.receipts.byMethod.other)} />
            </div>
          </div>

          <div style={box}>
            <div style={{ color: C.grigio, fontSize: 11, letterSpacing: 1, marginBottom: 12 }}>
              VENTAS ORIGINADAS EN EL PERÍODO
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <Metric testId="m-gross" label="Ventas" value={eur(snapshot.obligation.gross)} />
              <Metric testId="m-unpaid" label="Pendiente de cobro" value={eur(snapshot.obligation.unpaid)}
                tone={snapshot.obligation.unpaid > 0 ? C.orange : C.bianco} />
              <Metric testId="m-void" label="Anulado" value={eur(snapshot.obligation.voided)} />
              <Metric testId="m-refund" label="Devuelto" value={eur(snapshot.obligation.refunded)} />
              <Metric testId="m-tickets" label="Pedidos" value={String(snapshot.counts.obligations)} />
            </div>
            {/* The one sentence that stops the two blocks above being read as a
                single failed reconciliation. They are different questions. */}
            <div data-testid="two-sets-note" style={{ color: C.grigio, fontSize: 11, marginTop: 12, lineHeight: 1.5 }}>
              Las ventas son los pedidos <strong>originados</strong> en este período; lo cobrado es el dinero{' '}
              <strong>recibido</strong> en este período. Un pedido de las 21:21 cobrado a las 21:29 aparece en
              períodos distintos, y por eso las dos cifras no tienen por qué coincidir.
            </div>
          </div>

          {(snapshot.windowCrossing.obligationBeforeWindowReceiptInside.length > 0
            || snapshot.windowCrossing.obligationInsideWindowReceiptAfter.length > 0
            || snapshot.windowCrossing.receiptsSplitAcrossBoundary.length > 0) && (
            <div data-testid="window-crossing" style={{ ...box, borderColor: C.avana }}>
              <div style={{ color: C.avana, fontSize: 11, letterSpacing: 1, marginBottom: 8 }}>
                MOVIMIENTOS A CABALLO DEL PERÍODO
              </div>
              <div style={{ color: C.grigio, fontSize: 12, lineHeight: 1.6 }}>
                {snapshot.windowCrossing.obligationBeforeWindowReceiptInside.length > 0 && (
                  <div>· {snapshot.windowCrossing.obligationBeforeWindowReceiptInside.length} cobro(s) de pedidos anteriores al período.</div>
                )}
                {snapshot.windowCrossing.obligationInsideWindowReceiptAfter.length > 0 && (
                  <div>· {snapshot.windowCrossing.obligationInsideWindowReceiptAfter.length} cobro(s) posteriores al período, de pedidos de dentro.</div>
                )}
                {snapshot.windowCrossing.receiptsSplitAcrossBoundary.length > 0 && (
                  <div>· {snapshot.windowCrossing.receiptsSplitAcrossBoundary.length} pedido(s) con cobros partidos por el corte.</div>
                )}
              </div>
            </div>
          )}

          {/* ── CASH COUNT ───────────────────────────────────────────── */}
          <div style={{ ...box, borderColor: C.avana }}>
            <div style={{ color: C.bianco, fontSize: 14, fontWeight: 800, letterSpacing: 1 }}>
              CONTEO DE CAJA
            </div>
            {/* The load-bearing sentence of this whole panel. */}
            <div data-testid="cash-count-not-a-close" style={{ color: C.grigio, fontSize: 12, marginTop: 6, marginBottom: 16, lineHeight: 1.5 }}>
              Contar la caja <strong>no finaliza el servicio</strong> y no modifica ningún dato: solo deja registrado,
              con tu nombre y la hora, cuánto efectivo había físicamente en este momento.
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 14 }}>
              <Metric
                testId="m-cash-recorded"
                label="Efectivo registrado en el período"
                value={eur(cashRecorded)}
                hint="Cobros en efectivo registrados entre las dos horas de arriba."
              />
              {liveVariance !== null && (
                <Metric testId="m-variance-preview" label="Diferencia" value={eur(liveVariance)} tone={varianceTone(liveVariance)} />
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
              <label style={{ color: C.grigio, fontSize: 11 }}>
                Efectivo contado<br />
                <input
                  data-testid="counted-cash-input"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                  style={{ background: C.carbone2, color: C.bianco, border: `1px solid ${C.fumo}`, borderRadius: 8, padding: '9px 11px', marginTop: 4, width: 130, fontSize: 15, fontWeight: 700 }}
                />
              </label>
              <label style={{ color: C.grigio, fontSize: 11, flex: '1 1 200px' }}>
                Nota (opcional)<br />
                <input
                  data-testid="cash-count-note"
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  style={{ background: C.carbone2, color: C.bianco, border: `1px solid ${C.fumo}`, borderRadius: 8, padding: '9px 11px', marginTop: 4, width: '100%' }}
                />
              </label>
              <button
                data-testid="confirm-cash-count"
                onClick={confirm}
                disabled={!countedValid || saving}
                style={{
                  background: countedValid && !saving ? C.avana : C.fumo,
                  color: countedValid && !saving ? C.nero : C.grigio,
                  border: 'none', borderRadius: 10, padding: '11px 20px',
                  fontSize: 13, fontWeight: 800,
                  cursor: countedValid && !saving ? 'pointer' : 'not-allowed',
                }}
              >{saving ? 'Guardando…' : 'Registrar conteo'}</button>
            </div>

            {saveError && <div data-testid="cash-count-error" style={{ color: C.rosso, fontSize: 12, marginTop: 10 }}>{saveError}</div>}
            {justSaved && (
              <div data-testid="cash-count-saved" style={{ color: C.verde, fontSize: 12, marginTop: 10 }}>
                Conteo registrado: contado {eur(justSaved.countedCash)} · registrado {eur(justSaved.recordedCashReceipts)} · diferencia {eur(justSaved.variance)}.
              </div>
            )}
          </div>

          {history.length > 0 && (
            <div style={box}>
              <div style={{ color: C.grigio, fontSize: 11, letterSpacing: 1, marginBottom: 10 }}>
                CONTEOS ANTERIORES
              </div>
              <div data-testid="cash-count-history" style={{ display: 'grid', gap: 8 }}>
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
              <div data-testid="history-immutable-note" style={{ color: C.grigio, fontSize: 11, marginTop: 10 }}>
                Los conteos no se editan ni se borran. Si uno fue erróneo, registra uno nuevo.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

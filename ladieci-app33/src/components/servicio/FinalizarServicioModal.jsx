// ===============================================================
// FinalizarServicioModal — STALE SERVICE PROTECTION V1 (2026-09-06)
//
// The Finalizar servicio confirmation flow, lifted VERBATIM out of
// ServicioPage.jsx so it has exactly one implementation and can be mounted
// from two places:
//   1. ServicioPage — the normal bottom-bar "Finalizar servicio" button.
//   2. ServiceExceptionPanel — the PREVIOUS_SERVICE_PENDING recovery surface,
//      as "Finalizar servicio anterior". The stale service IS the current
//      service (migration 120 leaves the current-pointer read untouched), so
//      this flow closes exactly the right one with no id passed — the backend
//      resolves THE active service, same as before.
//
// Nothing here is new close logic: the pre-close scan, the non-blocking
// economic preflight (economyApi.reconciliation) and the confirm call are the
// ones ServicioPage carried since J-1 / FIN-01 / UAT-P2-D, and every rendered
// string / data-testid / MS token is unchanged. `notify` is an optional toast
// sink (ServiceExceptionPanel has no toast bus and passes none — the in-modal
// persistent "close-error" panel is the real feedback).
// ===============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { C } from '../../constants';
import * as MS from '../ui/mesaSurface';
import { economyApi } from '../../economy/economyApi';
import { api } from '../../api';
import { classifyCloseOutcome } from '../../utils/closeServiceOutcome';
import FinalizarReconciliationPanel from './FinalizarReconciliationPanel';

// Preflight-only failures. Spanish, and never alarming: the service close
// itself does not depend on this read.
const describeReconError = (e) => {
  const code = e && e.code;
  if (code === 'RECONCILIATION_NO_ACTIVE_SERVICE') return 'No hay ningún servicio abierto ahora mismo.';
  if (code === 'RECONCILIATION_AMBIGUOUS_ACTIVE_SERVICE') return 'Hay más de un servicio activo; revísalo antes de finalizar.';
  if (code === 'ECONOMY_READ_FORBIDDEN') return 'Tu perfil no tiene acceso a la economía.';
  if (code === 'ECONOMY_UNAUTHENTICATED' || code === 'ECONOMY_SESSION_STALE') return 'Tu sesión ha caducado.';
  if (code === 'ECONOMY_NETWORK_ERROR') return 'Sin conexión con el servidor.';
  return 'Inténtalo de nuevo.';
};

export default function FinalizarServicioModal({
  open,
  onClose,
  onClosed,
  notify = () => {},
  title = 'Finalizar servicio',
}) {
  // `flow` is the modal's own state (null = closed). Shape unchanged from the
  // inline version: { loading, completati, attivi, blocking, reconLoading,
  // recon, reconError, submitting, error }.
  const [flow, setFlow] = useState(null);

  // Callers usually pass inline `notify` / `onClose` closures, so keep them in
  // refs — the scan effect must fire on `open`, never on a parent re-render
  // (that would loop: scan → setFlow → re-render → new closures → scan again).
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  const runScan = useCallback(async () => {
    setFlow({ loading: true, completati: null, attivi: [], blocking: { orders: 0, tables: 0 }, reconLoading: true });
    try {
      // language-guard: allow-legacy scanServizio is the existing backend pre-close scan action name (wire string), not new vocabulary
      const scan = await api.get("scanServizio");
      setFlow({
        loading: false,
        completati: scan.completati,
        attivi: scan.attivi || [],
        blocking: scan.blocking || { orders: 0, tables: 0 },
        reconLoading: true,
      });
    } catch (err) {
      setFlow(null);
      notifyRef.current("❌ Error al escanear servicio", C.rosso);
      if (onCloseRef.current) onCloseRef.current();
      return;
    }
    // J-1 — the economic preflight, fetched separately and NEVER able to block
    // the close: it is information the operator reads before confirming, not a
    // precondition. No serviceSessionId is sent, so the backend resolves THE
    // active service — the same one Finalizar will close — rather than the
    // frontend guessing an id that could disagree with the action.
    try {
      const recon = await economyApi.reconciliation({});
      setFlow(m => m ? { ...m, reconLoading: false, recon, reconError: null } : m);
    } catch (e) {
      setFlow(m => m ? { ...m, reconLoading: false, recon: null, reconError: describeReconError(e) } : m);
    }
  }, []);

  useEffect(() => {
    if (open) { runScan(); }
    else { setFlow(null); }
  }, [open, runScan]);

  const dismiss = () => {
    setFlow(null);
    if (onCloseRef.current) onCloseRef.current();
  };

  const confirmClose = async () => {
    // S2-6A3E (recovered) — do NOT dismiss the modal yet: only a real success may
    // navigate away. Mark it submitting and clear any previous error so the
    // operator sees progress in place.
    const notify = notifyRef.current;
    const onClosed = onClosedRef.current;
    setFlow(m => m ? { ...m, submitting: true, error: null } : m);
    notify("🌙 Finalizando servicio...", C.giallo);
    // N-2 — deleteAttivi was never passed to this call: the backend's V3 close
    // engine (the only path any session can take now) never read it — a
    // residual pending order becomes a service_incidents row, not a forced
    // delete. The client must NEVER assume success: only success:true dismisses
    // the view; success:false stays a failure.
    try {
      // language-guard: allow-legacy chiudiServizio is the existing backend service-close action name (wire string), not new vocabulary
      const res = await api.get("chiudiServizio", {});
      const outcome = classifyCloseOutcome(res);
      if (outcome.kind === "success") {
        const s = res.summary || {};
        const eur = n => `${(Number(n)||0).toFixed(0)}€`;
        setFlow(null);
        // language-guard: allow-legacy the success toast is operator copy lifted verbatim (n_ordini is the backend summary field), not new vocabulary
        notify(`✅ ${s.n_ordini || 0} ordini · ${eur(s.cassa_totale)} archiviati`, C.verde);
        if (onClosed) onClosed(res);
      } else if (outcome.kind === "skipped") {
        setFlow(null);
        notify("ℹ️ Servicio ya cerrado hoy", C.giallo);
        if (onClosed) onClosed(res);
      } else {
        // HTTP 200 but success:false → application failure (22:00 guard, active
        // rider trip, verify_failed…). Keep the modal open and show the reason in
        // place; the service stays open and the operator can retry or cancel.
        setFlow(m => m ? { ...m, submitting: false, error: outcome.message } : m);
        notify(`❌ ${outcome.message}`, C.rosso);
        // language-guard: allow-legacy chiudiServizio is the existing backend action name in this diagnostic log line, not new vocabulary
        console.error("chiudiServizio:", res?.error);
      }
    } catch (err) {
      setFlow(m => m ? { ...m, submitting: false, error: "Error de red al cerrar el servicio. El servicio sigue abierto." } : m);
      notify("❌ Error de red al cerrar el servicio", C.rosso);
      console.error(err);
    }
  };

  if (!open || !flow) return null;

  return (
    <div style={MS.overlay}>
      <div style={MS.sheet(440)}>
        {/* FIN-01 -- the confirmation names the same action as the button
            that opened it, so the operator can see the flow through. */}
        <div style={MS.sheetHead}>
          <span style={MS.sheetTitle}>
            <MS.MesaIcon d={MS.ICON_MOON} size={19} style={{color:MS.ACCENT.service}} />
            {title}
          </span>
        </div>
        <div style={MS.sheetBody}>

        {flow.loading ? (
          <div style={{color:MS.TEXT.muted,textAlign:"center",padding:"24px 0",fontSize:13.5}}>Escaneando...</div>
        ) : (<>
          {/* Completados — siempre se archivan */}
          <div style={{...MS.card(),borderColor:"rgba(34,197,94,.3)",background:"rgba(34,197,94,.07)"}}>
            {/* J-1 — this used to read "Se archivarán y eliminarán", which
                the V3 close does NOT do. It closes the Operational Service;
                orders, financial events and cash counts all survive it
                untouched, and an unresolved order becomes an incident with
                its real exposure rather than a deletion (UAT-P2-D, proven
                live 2026-08-20 when #999008 stayed POR_CONFIRMAR). Promising
                deletion on the one screen that also shows the economy would
                tell an operator their records are about to disappear. */}
            <div data-testid="close-scope-note" style={{display:"flex",alignItems:"center",gap:7,color:MS.ACCENT.positive,fontWeight:800,fontSize:13.5,marginBottom:5}}>
              <MS.MesaIcon d={MS.ICON_CHECK} size={16} />
              Se cierra el servicio operativo
            </div>
            <div style={{color:MS.TEXT.body,fontSize:13}}>
              {/* language-guard: allow-legacy scan.completati.ordini is the existing backend pre-close scan field, not new vocabulary */}
              {(flow.completati?.ordini || 0)} órdenes completados
              {flow.completati?.conv > 0 ? ` · ${flow.completati.conv} conversaciones cerradas` : ""}
            </div>
            <div data-testid="records-preserved-note" style={{color:MS.TEXT.muted,fontSize:11.5,marginTop:5,lineHeight:1.45}}>
              Los registros económicos y los conteos de caja se conservan.
            </div>
          </div>

          {/* J-1 — the two economic scopes, side by side, above the
              existing pending-items block and the unchanged buttons. */}
          <FinalizarReconciliationPanel
            data={flow.recon}
            loading={flow.reconLoading}
            error={flow.reconError}
          />

          {/* Pendientes — el operador decide */}
          {flow.attivi.length > 0 ? (
            <div style={{...MS.card(),borderColor:"rgba(240,169,60,.36)",background:"rgba(240,169,60,.08)"}}>
              <div style={{display:"flex",alignItems:"center",gap:7,color:MS.ACCENT.warn,fontWeight:900,fontSize:11,letterSpacing:".6px",textTransform:"uppercase",marginBottom:9}}>
                <MS.MesaIcon d={MS.ICON_WARN} size={15} />
                {flow.attivi.length} elemento{flow.attivi.length>1?"s pendientes":" pendiente"}
              </div>
              <div style={{display:"flex",flexDirection:"column",maxHeight:150,overflowY:"auto"}}>
                {flow.attivi.map((a,i) => (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,color:MS.TEXT.value,fontSize:12.5,padding:"6px 0",borderTop:i===0?"none":MS.LINE.row}}>
                    <span style={{background:"rgba(240,169,60,.16)",border:"1px solid rgba(240,169,60,.34)",borderRadius:6,padding:"2px 7px",fontWeight:800,fontSize:10.5,letterSpacing:".3px",color:MS.ACCENT.warn,flexShrink:0}}>
                      {a.stato || "activo"}
                    </span>
                    <span style={{fontWeight:700,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.nombre}</span>
                    {a.hora ? <span style={{color:MS.TEXT.muted,marginLeft:"auto",flexShrink:0}}>{a.hora}</span> : null}
                  </div>
                ))}
              </div>
              <div style={{color:MS.TEXT.muted,fontSize:11.5,marginTop:9,lineHeight:1.45}}>
                {flow.blocking?.tables > 0
                  ? "Hay mesas con cuenta abierta: cóbralas antes de cerrar el servicio."
                  : flow.blocking?.orders > 0
                    // SMOKE FIX — this used to say "con su importe pendiente" for
                    // every unresolved order. An order can be POR_CONFIRMAR and
                    // already PAID: the backend files it as an operational
                    // incident with financial exposure null, and calling its
                    // amount pending is simply false. Operational pending and
                    // money owed are two different statements.
                    ? "Se registrarán como incidencias del cierre. Las que estén cobradas no dejan importe pendiente."
                    : "Los mensajes sin pedido pueden quedarse para el siguiente servicio."}
              </div>
            </div>
          ) : (
            <div style={{...MS.card(),padding:"11px 14px"}}>
              <div style={{color:MS.TEXT.muted,fontSize:13}}>No hay mensajes activos pendientes.</div>
            </div>
          )}

          {/* Error de cierre — fallo aplicativo (success:false), persistente.
              El servicio sigue abierto; el operador ve el motivo y puede reintentar. */}
          {flow.error && (
            <div data-testid="close-error" style={{...MS.card(),borderColor:"rgba(232,52,28,.5)",background:"rgba(232,52,28,.1)"}}>
              <div style={{color:MS.ACCENT.danger,fontWeight:900,fontSize:11,letterSpacing:".6px",textTransform:"uppercase",marginBottom:5}}>No se cerró el servicio</div>
              <div style={{color:MS.TEXT.strong,fontSize:13,lineHeight:1.45}}>{flow.error}</div>
              <div style={{color:MS.TEXT.muted,fontSize:11.5,marginTop:6}}>El servicio sigue abierto.</div>
            </div>
          )}

          {/* Botones */}
          <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:2,opacity:flow.submitting?0.6:1,pointerEvents:flow.submitting?"none":"auto"}}>
            {flow.blocking?.tables === 0 && flow.blocking?.orders > 0 && (
              <button disabled={flow.submitting} onClick={()=>confirmClose()}
                style={{...MS.button({tone:"danger",size:"lg",full:true}),boxShadow:"0 4px 18px rgba(192,57,43,.28)"}}>
                {/* UAT-P2-D -- this used to read "Cerrar y anular pedidos
                    activos", which the backend deliberately does NOT do:
                    the V3 close never invents a cancellation, it closes the
                    service and records each unresolved order as an incident
                    with its real economic exposure (proven live 2026-08-20:
                    #999008 stayed POR_CONFIRMAR and produced
                    ORDER_UNCONFIRMED_AT_CLOSE + UNPAID_BALANCE_AT_CLOSE).
                    The copy now describes what actually happens. */}
                <MS.MesaIcon d={MS.ICON_WARN} size={17} />
                Finalizar servicio con pendientes
              </button>
            )}
            {flow.blocking?.tables === 0 && flow.blocking?.orders === 0 && <button
              disabled={flow.submitting} onClick={()=>confirmClose()}
              style={{...MS.button({tone: flow.attivi.length > 0 ? "positive" : "danger",size:"lg",full:true}),
                ...(flow.attivi.length > 0 ? {} : {boxShadow:"0 4px 18px rgba(192,57,43,.28)"})}}>
              <MS.MesaIcon d={MS.ICON_CHECK} size={17} />
              {flow.submitting ? "Cerrando…" : (flow.attivi.length > 0 ? "Cerrar servicio (dejar mensajes activos)" : "Confirmar — cerrar servicio")}
            </button>}
            <button disabled={flow.submitting} onClick={()=>dismiss()}
              style={{...MS.button({tone:"neutral",full:true}),background:"transparent",color:MS.TEXT.label,fontWeight:700}}>
              {/* UAT-P3 -- "Annulla" was leftover Italian on a Spanish surface. */}
              {flow.error ? "Cerrar aviso" : "Cancelar"}
            </button>
          </div>
        </>)}
        </div>
      </div>
    </div>
  );
}

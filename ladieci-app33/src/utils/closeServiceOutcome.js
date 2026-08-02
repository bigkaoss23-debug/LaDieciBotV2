// S2-6A3E — interpret the chiudiServizio response.
// Recovered verbatim into the dynamic-menu line by S2-7D5.
//
// The backend returns HTTP 200 for BOTH success and application failure; the body's
// `success` flag is authoritative. A response is a real success ONLY when
// success === true. `skipped` (already closed) is a benign terminal state. Everything
// else — including success:false with an error, or a thrown network error — is a
// failure that must keep the close dialog open and never navigate away.

// Translate a close failure into a clean, operator-facing Spanish message. Surfaces the
// backend's own sentence when human-readable (e.g. the 22:00 guard), strips technical
// hints like "&force=true", and maps bare error codes. Never returns a raw stack trace.
export function closeFailureMessage(res) {
  const raw = String((res && res.error) || "").trim();
  const CODES = {
    verify_failed: "No se pudo archivar el servicio (verificación fallida). No se eliminó nada; vuelve a intentarlo.",
    ordenes_delete_failed: "No se pudieron eliminar los pedidos; el servicio sigue abierto.",
    NO_SERVICE_SESSION: "No hay un servicio abierto.",
    NO_OPEN_SERVICE_SESSION: "No hay un servicio abierto.",
    invalid_service_session_identity: "Estado del servicio inconsistente; recarga e inténtalo de nuevo.",
    rider_state_gate_failed: "Hay un reparto en curso; cierra el reparto antes de cerrar el servicio.",
    active_rider_trip: "Hay un reparto en curso; cierra el reparto antes de cerrar el servicio.",
    messa_tables_not_released: "Hay mesas con la cuenta abierta. Cobra esas cuentas antes de cerrar el servicio.",
    MESSA_TABLES_NOT_RELEASED: "Hay mesas con la cuenta abierta. Cobra esas cuentas antes de cerrar el servicio.",
    messa_table_gate_failed: "No se pudo comprobar el estado de las mesas. El servicio sigue abierto; recarga e inténtalo de nuevo.",
    service_active_orders_not_resolved: "Hay pedidos todavía en curso. Complétalos o elige cerrar anulando esos pedidos.",
    service_active_order_gate_failed: "No se pudo comprobar si quedan pedidos activos. El servicio sigue abierto; recarga e inténtalo de nuevo.",
  };
  if (CODES[raw]) return CODES[raw];
  if (/\s/.test(raw)) {
    return (
      raw
        .replace(/\.?\s*(per forzare|para forzar)[^.]*\.?$/i, "")
        .replace(/&force=true/gi, "")
        .trim() || "No se pudo cerrar el servicio."
    );
  }
  return "No se pudo cerrar el servicio.";
}

// Classify a chiudiServizio response into a UI outcome.
// Returns { kind: 'success' | 'skipped' | 'failure', message? }.
export function classifyCloseOutcome(res) {
  if (res && res.success === true) return { kind: "success" };
  if (res && res.skipped) return { kind: "skipped" };
  return { kind: "failure", message: closeFailureMessage(res) };
}

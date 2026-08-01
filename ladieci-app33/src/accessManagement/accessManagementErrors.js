// ─── Access Management V3 — centralized error-code → Spanish message (V3-I) ──
// ONE place that turns a write result's `kind` (set by accessManagementApi.js from
// the backend's `code`/HTTP status) into the sentence the owner sees. Never expose
// raw SQL, PostgREST bodies, stack traces, service/table names, the target's actor
// id, fingerprints, or step-up/token internals — every branch here is a fixed,
// pre-written Spanish sentence, never backend text passed through.
export function describeAccessWriteError(result) {
  if (!result) return 'No se pudo completar la operación.';
  switch (result.kind) {
    case 'unauthenticated':
      return 'Sesión expirada. Vuelve a entrar con el PIN.';
    case 'forbidden':
      return 'Acceso no permitido para este rol.';
    case 'not_found':
      return 'No se encontró esa persona. Actualiza la lista e inténtalo de nuevo.';
    case 'step_up_required':
      return 'Confirma tu identidad de nuevo para continuar.';
    case 'client_request_id_invalid':
      return 'No se pudo enviar la solicitud. Inténtalo de nuevo.';
    case 'role_invalid':
      return 'Ese rol no está disponible.';
    case 'display_name_invalid':
      return 'Ese nombre no es válido. Usa un nombre corto y sin caracteres especiales.';
    case 'pin_format_invalid':
      return 'El PIN debe tener exactamente 6 dígitos y no puede ser una secuencia obvia.';
    case 'pin_duplicate':
    case 'pin_reserved':
      // Never reveal WHICH other account already uses this PIN.
      return 'Ese PIN ya está en uso. Elige un PIN diferente.';
    case 'waiter_open_tables':
      return 'Este camarero todavía tiene mesas abiertas. Reasigna o cierra sus mesas antes de cambiar su rol o desactivarlo.';
    case 'idempotency_conflict':
      return 'La operación cambió mientras tanto. Actualiza la lista e inténtalo de nuevo.';
    case 'stale':
      // Every "expected snapshot didn't match" case collapses to AUTH_INVALID_REQUEST
      // server-side (no distinct wire code) — treated the same as a stale-list refresh.
      return 'Esta persona cambió mientras tanto. Actualiza la lista e inténtalo de nuevo.';
    case 'unavailable':
      return 'El servicio no está disponible en este momento. Inténtalo más tarde.';
    case 'network':
      return 'Error de red. Comprueba la conexión.';
    case 'malformed':
      return 'Respuesta inesperada del servidor.';
    case 'server':
    default:
      return 'No se pudo completar la operación. Inténtalo de nuevo.';
  }
}

import { auth } from "../api";
import { BACKEND_BASE_URL } from "../utils/backendBase";

export const MESA_API_ROOT = "/api/mesa/v1";

export class MesaApiError extends Error {
  constructor(code, status = 0) {
    super(code || "MESA_NETWORK_ERROR");
    this.name = "MesaApiError";
    this.code = code || "MESA_NETWORK_ERROR";
    this.status = status;
  }
}

const SESSION_CODES = new Set(["MESA_UNAUTHENTICATED", "MESA_SESSION_STALE"]);

function invalidateOperationalSession() {
  try { auth.clear(); } catch (_) { /* noop */ }
  try { window.dispatchEvent(new Event("ld-operational-unauthorized")); } catch (_) { /* noop */ }
}

async function request(method, path, body) {
  const token = auth.getToken();
  if (!token) throw new MesaApiError("MESA_UNAUTHENTICATED", 401);

  let response;
  try {
    response = await fetch(BACKEND_BASE_URL + MESA_API_ROOT + path, {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body == null ? {} : { "Content-Type": "application/json" }),
      },
      ...(body == null ? {} : { body: JSON.stringify(body) }),
    });
  } catch (_) {
    throw new MesaApiError("MESA_NETWORK_ERROR", 0);
  }

  let payload = null;
  try { payload = await response.json(); } catch (_) { /* handled below */ }
  const code = typeof payload?.code === "string" ? payload.code : null;
  if (SESSION_CODES.has(code)) invalidateOperationalSession();
  if (!response.ok || !payload || payload.ok !== true) {
    throw new MesaApiError(code || "MESA_SERVER_ERROR", response.status);
  }
  return payload;
}

export const createMesaRequestId = (prefix = "mesa") => {
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now()}${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${id}`.slice(0, 128);
};

export const mesaApi = Object.freeze({
  floor({ includeInactive = false } = {}) {
    return request("GET", `/floor${includeInactive ? "?includeInactive=true" : ""}`);
  },
  // ACC-01 (2026-08-21 forensic audit) -- the two READ-ONLY reads that let an
  // operator look back at a table they have just closed. `floor` returns open
  // sessions only, so before these the account, the comandas and the payment
  // history all vanished from the UI the instant the table closed (the durable
  // rows were never touched -- only unreachable).
  recentClosedSessions({ limit } = {}) {
    const query = limit ? `?limit=${encodeURIComponent(String(limit))}` : "";
    return request("GET", `/sessions/recent-closed${query}`);
  },
  sessionAccount(sessionId) {
    return request("GET", `/sessions/${encodeURIComponent(sessionId)}/account`);
  },
  openTable(tableId) {
    return request("POST", `/tables/${encodeURIComponent(tableId)}/open`, {});
  },
  releaseEmptyTable(sessionId) {
    return request("POST", `/sessions/${encodeURIComponent(sessionId)}/release`, {});
  },
  // P0-B.1 — the explicit close for an OCCUPIED table (releaseEmptyTable
  // above stays scoped to the never-ordered case). No force param exposed
  // here: force-close is backend-only in this phase, no frontend UI for it.
  closeTable(sessionId) {
    return request("POST", `/sessions/${encodeURIComponent(sessionId)}/close`, {});
  },
  saveTable(tableId, table) {
    return request("PUT", `/tables/${encodeURIComponent(tableId || "new")}`, table);
  },
  addCommand(sessionId, command) {
    return request("POST", `/sessions/${encodeURIComponent(sessionId)}/commands`, command);
  },
  // MESA_SEND_TO_KITCHEN_P0_FIX (2026-08-14) -- persists covers the moment
  // the operator selects them, server-authoritative, before the picker even
  // opens. See the paired backend migration's own root-cause note: covers
  // used to only ever land as a side effect of the first comanda's SUCCESS,
  // so an actively-worked table with no comanda sent yet was indistinguishable
  // from a genuinely empty one to the service-lifecycle close engine's
  // auto-release sweep -- which silently destroyed a real in-progress draft
  // on 2026-08-14.
  setCovers(sessionId, coversTotal) {
    return request("POST", `/sessions/${encodeURIComponent(sessionId)}/covers`, { coversTotal });
  },
  markServed(sessionId, orderId) {
    return request("POST", `/sessions/${encodeURIComponent(sessionId)}/commands/${encodeURIComponent(orderId)}/served`, {});
  },
  pay(sessionId, payment) {
    return request("POST", `/sessions/${encodeURIComponent(sessionId)}/payments`, payment);
  },
  createReservation(tableId, reservation) {
    return request("POST", `/tables/${encodeURIComponent(tableId)}/reservations`, reservation);
  },
  updateReservation(reservationId, reservation) {
    return request("PUT", `/reservations/${encodeURIComponent(reservationId)}`, reservation);
  },
  setReservationStatus(reservationId, expectedVersion, status) {
    return request("POST", `/reservations/${encodeURIComponent(reservationId)}/status`, { expectedVersion, status });
  },
  openReservation(reservationId, expectedVersion) {
    return request("POST", `/reservations/${encodeURIComponent(reservationId)}/open`, { expectedVersion });
  },
});

// DUP-01 -- the ONE wire code that is not an error the operator can only read.
// mesa_post_payment_v1 raises it when this table session already took a payment
// with the SAME kind/mode/amount/payment_method/covers_settled under a DIFFERENT
// client_request_id in the last 120 seconds. That shape is genuinely ambiguous:
// it is what a double-submit looks like, and equally what "two guests each pay
// 30,00 tarjeta on a 60,00 check" looks like. The backend has always been able
// to tell them apart -- it just needs the operator to say which one this is,
// via p_confirm_duplicate (see mesaDao.js:223 / mesaService.js:502 on the
// backend, both of which have shipped since 2026-08-15).
//
// Exported so the payment hub and its tests share ONE spelling of the code
// rather than each carrying a literal that could drift from the backend's.
export const MESA_DUPLICATE_PAYMENT_CODE = "MESA_POSSIBLE_DUPLICATE_PAYMENT";

// MESA_ error-code keys are the wire vocabulary shared with the backend
// (mesaHttpHandlers/mesaService) and, for several codes, the mesa_*_v1 Postgres
// functions. This frontend build must not deploy ahead of the coordinated V3-J
// migration+backend rollout -- see mesaService.js on the backend.
const ERROR_MESSAGES = Object.freeze({
  MESA_NETWORK_ERROR: "Sin conexión con el sistema de mesas. Inténtalo de nuevo.",
  MESA_SERVER_ERROR: "No se pudo completar la operación.",
  MESA_SERVICE_NOT_OPEN: "Primero hay que abrir el servicio.",
  MESA_TABLE_NOT_RELEASED: "Esta mesa tiene una cuenta abierta.",
  MESA_TABLE_ACCOUNT_OPEN: "Esta mesa ya tiene una cuenta abierta.",
  MESA_TABLE_UNAVAILABLE: "Esta mesa no está disponible.",
  MESA_SESSION_NOT_OPEN: "La cuenta de esta mesa ya no está abierta.",
  MESA_ALREADY_SETTLED: "La cuenta ya está pagada.",
  MESA_LINE_SELECTION_SETTLED: "Esos productos ya están pagados.",
  MESA_PAYMENT_AMOUNT_INVALID: "El importe no es válido para el saldo pendiente.",
  MESA_LINE_SELECTION_INVALID: "Selecciona productos pendientes de pago.",
  MESA_PAYMENT_IDEMPOTENCY_CONFLICT: "El pago no se ha repetido: actualiza la mesa y compruébalo.",
  // DUP-01 -- reached only when this code arrives somewhere that does NOT offer
  // the confirmation (any surface other than the payment hub, or a confirmed
  // retry that somehow came back duplicate again). It must never read as a
  // technical failure: nothing is broken, the payment is simply unconfirmed.
  [MESA_DUPLICATE_PAYMENT_CODE]: "Ya se registró un pago idéntico hace poco. Confirma que es un segundo pago real.",
  MESA_WAITER_NOT_ASSIGNED: "Esta mesa está asignada a otro camarero.",
  MESA_COMMAND_NOT_READY: "La comanda todavía no está lista en Cocina.",
  MESA_COMMAND_NOT_FOUND: "No se encontró esta comanda en la mesa.",
  MESA_COMMAND_STATE_FAILED: "No se pudo marcar la comanda como servida.",
  MESA_FORBIDDEN: "Tu acceso no permite realizar esta operación.",
  MESA_LAYOUT_FORBIDDEN: "Solo el responsable puede cambiar la sala.",
  MESA_RESERVATION_FORBIDDEN: "Tu acceso no permite gestionar reservas.",
  MESA_RESERVATION_INVALID: "Revisa los datos de la reserva.",
  MESA_RESERVATION_TIME_INVALID: "La fecha o la hora de la reserva no es válida.",
  MESA_RESERVATION_NOT_FOUND: "La reserva ya no existe.",
  MESA_RESERVATION_NOT_BOOKED: "Esta reserva ya se ha atendido, cancelado o cerrado.",
  MESA_RESERVATION_OVERLAP: "Esta mesa ya tiene otra reserva durante esas dos horas.",
  MESA_RESERVATION_VERSION_CONFLICT: "Otro operador ha cambiado esta reserva. Actualiza antes de continuar.",
  MESA_RESERVATION_CAPACITY_EXCEEDED: "Los cubiertos superan la capacidad máxima de esta mesa.",
  MESA_TABLE_HAS_RESERVATIONS: "Esta mesa tiene reservas futuras. Muévelas o cancélalas antes de quitarla.",
  MESA_COVERS_REQUIRED: "Indica el número de comensales para esta primera comanda.",
  MESA_COVERS_NOT_SET: "Todavía no se han indicado los comensales de esta mesa.",
  MESA_COVERS_IMMUTABLE: "No se pueden reducir los comensales ya registrados.",
  MESA_TABLE_HAS_ORDERS: "Esta mesa ya tiene comandas; cobra la cuenta para cerrarla.",
  MESA_TABLE_NOT_SETTLED: "Esta mesa todavía tiene saldo pendiente. Cóbralo antes de cerrar la mesa.",
  MESA_TABLE_HAS_ACTIVE_ORDERS: "Faltan comandas por servir.",
  MESA_RELOGIN_REQUIRED: "Vuelve a entrar con tu PIN antes de cobrar.",
  MESA_UNAUTHENTICATED: "La sesión ha caducado.",
  MESA_SESSION_STALE: "Tu acceso ha cambiado. Vuelve a entrar.",
  // Not MESA_-prefixed: this one comes from the order-intake schedule
  // resolver (resolve_order_intake_context_v1 / orderIntakePolicy.js on the
  // backend), reused as-is for addCommand's own rejection during the daily
  // 17:30-18:00 buffer between lunch and dinner service.
  ORDER_INTAKE_CLOSED: "Ahora no se pueden enviar nuevas comandas. El servicio vuelve a abrir a las 18:00.",
});

export function describeMesaError(error) {
  const code = error?.code || "MESA_SERVER_ERROR";
  return ERROR_MESSAGES[code] || "No se pudo completar la operación. Actualiza e inténtalo de nuevo.";
}

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
  openTable(tableId) {
    return request("POST", `/tables/${encodeURIComponent(tableId)}/open`, {});
  },
  releaseEmptyTable(sessionId) {
    return request("POST", `/sessions/${encodeURIComponent(sessionId)}/release`, {});
  },
  saveTable(tableId, table) {
    return request("PUT", `/tables/${encodeURIComponent(tableId || "new")}`, table);
  },
  addCommand(sessionId, command) {
    return request("POST", `/sessions/${encodeURIComponent(sessionId)}/commands`, command);
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
  MESA_RELOGIN_REQUIRED: "Vuelve a entrar con tu PIN antes de cobrar.",
  MESA_UNAUTHENTICATED: "La sesión ha caducado.",
  MESA_SESSION_STALE: "Tu acceso ha cambiado. Vuelve a entrar.",
});

export function describeMesaError(error) {
  const code = error?.code || "MESA_SERVER_ERROR";
  return ERROR_MESSAGES[code] || "No se pudo completar la operación. Actualiza e inténtalo de nuevo.";
}

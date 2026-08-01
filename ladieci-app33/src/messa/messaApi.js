import { auth } from "../api";
import { BACKEND_BASE_URL } from "../utils/backendBase";

export const MESSA_API_ROOT = "/api/messa/v1";

export class MessaApiError extends Error {
  constructor(code, status = 0) {
    super(code || "MESSA_NETWORK_ERROR");
    this.name = "MessaApiError";
    this.code = code || "MESSA_NETWORK_ERROR";
    this.status = status;
  }
}

const SESSION_CODES = new Set(["MESSA_UNAUTHENTICATED", "MESSA_SESSION_STALE"]);

function invalidateOperationalSession() {
  try { auth.clear(); } catch (_) { /* noop */ }
  try { window.dispatchEvent(new Event("ld-operational-unauthorized")); } catch (_) { /* noop */ }
}

async function request(method, path, body) {
  const token = auth.getToken();
  if (!token) throw new MessaApiError("MESSA_UNAUTHENTICATED", 401);

  let response;
  try {
    response = await fetch(BACKEND_BASE_URL + MESSA_API_ROOT + path, {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body == null ? {} : { "Content-Type": "application/json" }),
      },
      ...(body == null ? {} : { body: JSON.stringify(body) }),
    });
  } catch (_) {
    throw new MessaApiError("MESSA_NETWORK_ERROR", 0);
  }

  let payload = null;
  try { payload = await response.json(); } catch (_) { /* handled below */ }
  const code = typeof payload?.code === "string" ? payload.code : null;
  if (SESSION_CODES.has(code)) invalidateOperationalSession();
  if (!response.ok || !payload || payload.ok !== true) {
    throw new MessaApiError(code || "MESSA_SERVER_ERROR", response.status);
  }
  return payload;
}

export const createMessaRequestId = (prefix = "messa") => {
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now()}${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${id}`.slice(0, 128);
};

export const messaApi = Object.freeze({
  floor({ includeInactive = false } = {}) {
    return request("GET", `/floor${includeInactive ? "?includeInactive=true" : ""}`);
  },
  openTable(tableId, coversTotal) {
    return request("POST", `/tables/${encodeURIComponent(tableId)}/open`, { coversTotal });
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

const ERROR_MESSAGES = Object.freeze({
  MESSA_NETWORK_ERROR: "Sin conexión con el sistema de mesas. Inténtalo de nuevo.",
  MESSA_SERVER_ERROR: "No se pudo completar la operación.",
  MESSA_SERVICE_NOT_OPEN: "Primero hay que abrir el servicio.",
  MESSA_TABLE_NOT_RELEASED: "Esta mesa tiene una cuenta abierta.",
  MESSA_TABLE_ACCOUNT_OPEN: "Esta mesa ya tiene una cuenta abierta.",
  MESSA_TABLE_UNAVAILABLE: "Esta mesa no está disponible.",
  MESSA_SESSION_NOT_OPEN: "La cuenta de esta mesa ya no está abierta.",
  MESSA_ALREADY_SETTLED: "La cuenta ya está pagada.",
  MESSA_LINE_SELECTION_SETTLED: "Esos productos ya están pagados.",
  MESSA_PAYMENT_AMOUNT_INVALID: "El importe no es válido para el saldo pendiente.",
  MESSA_LINE_SELECTION_INVALID: "Selecciona productos pendientes de pago.",
  MESSA_PAYMENT_IDEMPOTENCY_CONFLICT: "El pago no se ha repetido: actualiza la mesa y compruébalo.",
  MESSA_WAITER_NOT_ASSIGNED: "Esta mesa está asignada a otro camarero.",
  MESSA_COMMAND_NOT_READY: "La comanda todavía no está lista en Cocina.",
  MESSA_COMMAND_NOT_FOUND: "No se encontró esta comanda en la mesa.",
  MESSA_COMMAND_STATE_FAILED: "No se pudo marcar la comanda como servida.",
  MESSA_FORBIDDEN: "Tu acceso no permite realizar esta operación.",
  MESSA_LAYOUT_FORBIDDEN: "Solo el responsable puede cambiar la sala.",
  MESSA_RESERVATION_FORBIDDEN: "Tu acceso no permite gestionar reservas.",
  MESSA_RESERVATION_INVALID: "Revisa los datos de la reserva.",
  MESSA_RESERVATION_TIME_INVALID: "La fecha o la hora de la reserva no es válida.",
  MESSA_RESERVATION_NOT_FOUND: "La reserva ya no existe.",
  MESSA_RESERVATION_NOT_BOOKED: "Esta reserva ya se ha atendido, cancelado o cerrado.",
  MESSA_RESERVATION_OVERLAP: "Esta mesa ya tiene otra reserva durante esas dos horas.",
  MESSA_RESERVATION_VERSION_CONFLICT: "Otro operador ha cambiado esta reserva. Actualiza antes de continuar.",
  MESSA_RESERVATION_CAPACITY_EXCEEDED: "Los cubiertos superan la capacidad máxima de esta mesa.",
  MESSA_TABLE_HAS_RESERVATIONS: "Esta mesa tiene reservas futuras. Muévelas o cancélalas antes de quitarla.",
  MESSA_RELOGIN_REQUIRED: "Vuelve a entrar con tu PIN antes de cobrar.",
  MESSA_UNAUTHENTICATED: "La sesión ha caducado.",
  MESSA_SESSION_STALE: "Tu acceso ha cambiado. Vuelve a entrar.",
});

export function describeMessaError(error) {
  const code = error?.code || "MESSA_SERVER_ERROR";
  return ERROR_MESSAGES[code] || "No se pudo completar la operación. Actualiza e inténtalo de nuevo.";
}

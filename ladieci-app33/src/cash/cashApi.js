import { auth } from "../api";
import { BACKEND_BASE_URL } from "../utils/backendBase";
import { createMesaRequestId } from "../mesa/mesaApi";

// CHECK-CENTRIC UNIVERSAL CASH V1 — client for the check-centric cash surface
// (Servicio/Banco/Retiro). Structural analogue of ../mesa/mesaApi.js: same
// auth/fetch pattern, same request-id generator (reused, not duplicated) —
// a parallel client for a parallel target (a check instead of a table
// session), not a second transport.

export const CASH_API_ROOT = "/api/cash/v1";

export class CashApiError extends Error {
  constructor(code, status = 0) {
    super(code || "CASH_NETWORK_ERROR");
    this.name = "CashApiError";
    this.code = code || "CASH_NETWORK_ERROR";
    this.status = status;
  }
}

export const CASH_DUPLICATE_PAYMENT_CODE = "ORDER_PAYMENT_POSSIBLE_DUPLICATE";

const SESSION_CODES = new Set(["CASH_UNAUTHENTICATED", "CASH_SESSION_STALE"]);

function invalidateOperationalSession() {
  try { auth.clear(); } catch (_) { /* noop */ }
  try { window.dispatchEvent(new Event("ld-operational-unauthorized")); } catch (_) { /* noop */ }
}

async function request(method, path, body) {
  const token = auth.getToken();
  if (!token) throw new CashApiError("CASH_UNAUTHENTICATED", 401);

  let response;
  try {
    response = await fetch(BACKEND_BASE_URL + CASH_API_ROOT + path, {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body == null ? {} : { "Content-Type": "application/json" }),
      },
      ...(body == null ? {} : { body: JSON.stringify(body) }),
    });
  } catch (_) {
    throw new CashApiError("CASH_NETWORK_ERROR", 0);
  }

  let payload = null;
  try { payload = await response.json(); } catch (_) { /* handled below */ }
  const code = typeof payload?.code === "string" ? payload.code : null;
  if (SESSION_CODES.has(code)) invalidateOperationalSession();
  if (!response.ok || !payload || payload.ok !== true) {
    throw new CashApiError(code || "CASH_SERVER_ERROR", response.status);
  }
  return payload;
}

export const cashApi = Object.freeze({
  checkAccount(orderUid) {
    return request("GET", `/checks/${encodeURIComponent(orderUid)}`);
  },
  pay(orderUid, payment) {
    return request("POST", `/checks/${encodeURIComponent(orderUid)}/payments`, payment);
  },
  refund(orderUid, refund) {
    return request("POST", `/checks/${encodeURIComponent(orderUid)}/refunds`, refund);
  },
  adjust(orderUid, adjustment) {
    return request("POST", `/checks/${encodeURIComponent(orderUid)}/adjustments`, adjustment);
  },
});

// One frozen dictionary, same discipline as mesaApi.js's describeMesaError:
// unknown codes fall back to a generic retry sentence, never raw backend text.
const ERROR_MESSAGES = Object.freeze({
  CASH_UNAUTHENTICATED: "Tu sesión ha caducado. Vuelve a entrar.",
  CASH_SESSION_STALE: "Tu sesión ha caducado. Vuelve a entrar.",
  CASH_FORBIDDEN: "Tu rol no puede realizar esta acción de caja.",
  CASH_RELOGIN_REQUIRED: "Vuelve a entrar para poder registrar el cobro.",
  CASH_ORDER_NOT_FOUND: "No se encontró el pedido.",
  CASH_ORDER_IS_TABLE_ORDER: "Este pedido pertenece a una mesa — cóbralo desde la pantalla de la mesa.",
  ORDER_PAYMENT_ALREADY_SETTLED: "Este pedido ya está completamente cobrado.",
  ORDER_PAYMENT_AMOUNT_INVALID: "El importe no es válido.",
  ORDER_PAYMENT_POSSIBLE_DUPLICATE: "Ya se registró un pago idéntico hace poco.",
  ORDER_PAYMENT_FORBIDDEN: "Tu rol no puede registrar cobros.",
  ORDER_PAYMENT_NO_OPEN_SERVICE: "No hay un servicio abierto para registrar el cobro.",
  ORDER_REFUND_REASON_REQUIRED: "Indica el motivo del reembolso.",
  ORDER_REFUND_ALREADY_FULL: "Este pago ya fue reembolsado por completo.",
  ORDER_REFUND_EXCEEDS_REMAINING: "El importe supera lo que queda por reembolsar.",
  ORDER_REFUND_NOT_REFUNDABLE: "Este movimiento no se puede reembolsar.",
  ORDER_REFUND_NOT_CHECK_CENTRIC: "Este pago pertenece a una mesa — reembólsalo desde la pantalla de la mesa.",
  ORDER_REFUND_TRANSACTION_MISMATCH: "El pago original no coincide con este pedido.",
  ORDER_REFUND_TRANSACTION_NOT_FOUND: "No se encontró el pago original.",
  ORDER_REFUND_FORBIDDEN: "Tu rol no puede registrar reembolsos.",
  ORDER_ADJUSTMENT_REASON_REQUIRED: "Indica el motivo del ajuste.",
  ORDER_ADJUSTMENT_FORBIDDEN: "Tu rol no puede corregir el importe.",
  ORDER_ADJUSTMENT_NO_CHANGE: "El importe indicado es igual al actual.",
  MESA_ADJUSTMENT_EXCEEDS_OBLIGATION: "El nuevo importe no puede ser mayor que el actual.",
  MESA_ADJUSTMENT_STALE_OBLIGATION: "El importe cambió mientras tanto. Actualiza y vuelve a intentarlo.",
  MESA_ADJUSTMENT_ORDER_NOT_FOUND: "No se encontró el pedido.",
});

export function describeCashError(error) {
  const code = error?.code || "CASH_SERVER_ERROR";
  return ERROR_MESSAGES[code] || "No se pudo completar la operación. Actualiza e inténtalo de nuevo.";
}

export { createMesaRequestId as createCashRequestId };

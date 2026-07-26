// ===============================================================
// serviceSessionError.js — S2-7D5
//
// Recognise the ONE domain refusal that blocks order creation.
//
// NO_OPEN_SERVICE_SESSION is raised by a database trigger
// (public.service_session_assign_order, BEFORE INSERT ON ordenes), so it does
// not arrive as a clean typed code: the backend wraps it as HTTP 200 with
//   { success:false, error:"errore DB", detail:"NO_OPEN_SERVICE_SESSION" }
// and proxyPostStrict turns that into a thrown Error. "errore DB" is useless to
// an operator, so the marker is searched wherever it can legitimately appear —
// never by guessing from the generic wrapper text.
// ===============================================================

export const NO_OPEN_SERVICE_SESSION_CODE = 'NO_OPEN_SERVICE_SESSION';

export const NO_OPEN_SERVICE_SESSION_MESSAGE =
  'No hay un servicio abierto. Abre el servicio antes de confirmar pedidos.\n' +
  'Cierra esta ventana para abrir el servicio — tu pedido se conserva.';

const hasMarker = (value) =>
  typeof value === 'string' && value.indexOf(NO_OPEN_SERVICE_SESSION_CODE) !== -1;

// Accepts a raw response body, a thrown Error carrying `.response`, or either
// nested one level. Returns true only on an explicit marker match.
export function isNoOpenServiceSession(input) {
  if (!input) return false;
  if (hasMarker(input)) return true;
  if (typeof input !== 'object') return false;
  const candidates = [
    input.detail,
    input.error,
    input.code,
    input.message,
    input.response && input.response.detail,
    input.response && input.response.error,
    input.response && input.response.code,
  ];
  return candidates.some(hasMarker);
}

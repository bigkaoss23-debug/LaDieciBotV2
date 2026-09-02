import { auth } from "../api";
import { BACKEND_BASE_URL } from "../utils/backendBase";

// I-1 — client for /api/economy/v1. Mirrors mesaApi.js exactly (Bearer token,
// no-store, typed error codes, session invalidation on a stale/absent session)
// so there is one transport idiom in this frontend, not two.
export const ECONOMY_API_ROOT = "/api/economy/v1";

export class EconomyApiError extends Error {
  constructor(code, status = 0) {
    super(code || "ECONOMY_NETWORK_ERROR");
    this.name = "EconomyApiError";
    this.code = code || "ECONOMY_NETWORK_ERROR";
    this.status = status;
  }
}

const SESSION_CODES = new Set(["ECONOMY_UNAUTHENTICATED", "ECONOMY_SESSION_STALE"]);

function invalidateOperationalSession() {
  try { auth.clear(); } catch (_) { /* noop */ }
  try { window.dispatchEvent(new Event("ld-operational-unauthorized")); } catch (_) { /* noop */ }
}

async function request(method, path, body) {
  const token = auth.getToken();
  if (!token) throw new EconomyApiError("ECONOMY_UNAUTHENTICATED", 401);

  let response;
  try {
    response = await fetch(BACKEND_BASE_URL + ECONOMY_API_ROOT + path, {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body == null ? {} : { "Content-Type": "application/json" }),
      },
      ...(body == null ? {} : { body: JSON.stringify(body) }),
    });
  } catch (_) {
    throw new EconomyApiError("ECONOMY_NETWORK_ERROR", 0);
  }

  let payload = null;
  try { payload = await response.json(); } catch (_) { /* handled below */ }
  const code = typeof payload?.code === "string" ? payload.code : null;
  if (SESSION_CODES.has(code)) invalidateOperationalSession();
  if (!response.ok || !payload || payload.ok !== true) {
    throw new EconomyApiError(code || "ECONOMY_SERVER_ERROR", response.status);
  }
  return payload;
}

const qs = (params) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const out = search.toString();
  return out ? `?${out}` : "";
};

export const createEconomyRequestId = (prefix = "cash") => {
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now()}${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${id}`.slice(0, 128);
};

export const economyApi = Object.freeze({
  // Read-only. A GET, with no request body and nothing to confirm.
  snapshot({ preset, from, to, businessDate, asOf, serviceSessionId } = {}) {
    return request("GET", `/snapshot${qs({ preset, from, to, businessDate, asOf, serviceSessionId })}`);
  },
  // J-1 — the Finalizar preflight. Read-only: it returns the closing service's
  // own economy AND its Business Day reconciliation as two separate scopes,
  // plus the cash count only if one exists for exactly that window. Omitting
  // serviceSessionId asks the backend to resolve THE active service — the one
  // Finalizar would close — so the preflight can never describe a different
  // service than the action does.
  reconciliation({ serviceSessionId } = {}) {
    return request("GET", `/reconciliation${qs({ serviceSessionId })}`);
  },
  listCashCounts({ from, to, limit } = {}) {
    return request("GET", `/cash-counts${qs({ from, to, limit })}`);
  },
  // PENDENCIAS ECONÓMICAS SLICE 1 — the canonical read-only exposures reader.
  // A GET, no body, nothing to confirm: it returns the unresolved economic
  // exposures (POR_COBRAR / POR_DEVOLVER / REQUIERE_REVISION) as pure
  // projections, recomputed on every read. The backend owns workspace scoping
  // from the token; the only params it accepts are the ones below. This client
  // performs NO write against a pendencia — a pendencia clears only when
  // canonical backend economic truth changes.
  pendencies({ direction, from, to, q } = {}) {
    return request("GET", `/pendencies${qs({ direction, from, to, q })}`);
  },
  // The ONLY write this client can perform. It appends one count; there is
  // deliberately no update and no delete method here, because the backend
  // and the database both refuse them.
  createCashCount({ preset, from, to, businessDate, serviceSessionId, countedCash, note, clientRequestId }) {
    return request("POST", "/cash-counts", {
      preset, from, to, businessDate, serviceSessionId, countedCash, note, clientRequestId,
    });
  },
});

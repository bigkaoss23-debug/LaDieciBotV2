// ===============================================================
// persistenceGateway.js — S2-7D4E-A (Root Cause R1)
//
// The ONE place an order attempt crosses from "decided" to "persisted".
//
// The submission handler must not know that draft mode exists, nor that it is
// implemented as a build-time environment guard. It asks the gateway to persist
// and receives exactly one typed result. That is the whole contract:
//
//   { status: "success", data }
//   { status: "blocked", code, message }
//   { status: "error",   code, message, detail }
//
// WHY THIS MOVED HERE
// Draft blocking used to sit at the top of the click handler as
// `if (DRAFT_NO_PERSIST) { alert(...); return; }`. That short-circuited the real
// lifecycle — validation, planner gating, business confirmations and the
// submitting state never ran — so the draft could not actually exercise, and
// therefore could not accept, the behaviour it existed to verify. Blocking at
// the persistence boundary keeps the entire flow honest and stops the write at
// the only point that matters: before any mutating request is issued.
//
// `api.js` keeps its own fail-closed guard on proxyPost and the direct sb.*
// helpers. That redundancy is deliberate: this gateway is the intended path,
// that one is the backstop for any code that ever bypasses it.
// ===============================================================

import { DRAFT_NO_PERSIST, DRAFT_NOTICE } from "../draftGuard";

export const RESULT_STATUS = { SUCCESS: "success", BLOCKED: "blocked", ERROR: "error" };
export const BLOCK_CODE = { DRAFT_NO_PERSIST: "draft_no_persist" };

export const successResult = (data = null) => ({ status: RESULT_STATUS.SUCCESS, data });
export const blockedResult = (code, message) => ({ status: RESULT_STATUS.BLOCKED, code, message });
export const errorResult = (code, message, detail = null) => ({
  status: RESULT_STATUS.ERROR, code, message, detail,
});

// True when this build must not persist anything. Read through a function so
// tests can reason about it and callers never inline the env check themselves.
export function isPersistenceBlocked() {
  return DRAFT_NO_PERSIST === true;
}

export function draftBlockedResult() {
  return blockedResult(BLOCK_CODE.DRAFT_NO_PERSIST, DRAFT_NOTICE);
}

// Persist an order attempt.
//
//   payload  the thing to persist (already snapshotted by the lifecycle)
//   persist  async (payload) => any — the real write, injected by the caller so
//            this module stays free of transport and of component wiring.
//
// Never throws: an exception from `persist` becomes a typed error result, so the
// lifecycle always has exactly one outcome to render.
export async function submitOrderPayload(payload, { persist } = {}) {
  // The write lock is evaluated BEFORE the injected persist function is called,
  // so in a blocked build no mutating request is ever constructed, let alone sent.
  if (isPersistenceBlocked()) return draftBlockedResult();

  if (typeof persist !== "function") {
    return errorResult("no_persist_fn", "No hay un canal de guardado configurado.");
  }
  try {
    const data = await persist(payload);
    // A blocked/typed result coming back from a deeper layer (e.g. the api-level
    // fail-closed guard) is honoured rather than being mistaken for success.
    if (data && data.draftBlocked) {
      return blockedResult(BLOCK_CODE.DRAFT_NO_PERSIST, data.error || DRAFT_NOTICE);
    }
    return successResult(data ?? null);
  } catch (err) {
    return errorResult(
      (err && err.code) || "persist_failed",
      (err && err.message) || "No se pudo guardar el pedido. Inténtalo de nuevo.",
      err
    );
  }
}

// ===============================================================
// draftGuard.js — S2-7D4D-FIX1
//
// DRAFT-ONLY WRITE LOCK.
//
// A Netlify draft is wired to the SAME staging proxy and the SAME staging
// Supabase project as the published site. "Please don't create an order" is a
// promise, not a mechanism: one accidental click on Confirmar persists real
// rows. This module turns that promise into an enforced boundary.
//
// Enabled by REACT_APP_DRAFT_NO_PERSIST === "true" (build-time, CRA). Absent or
// any other value => no effect whatsoever, so a normal staging/production build
// is byte-for-byte unaffected in behaviour.
//
// WHAT IS BLOCKED: every mutation, refused BEFORE the network call, so nothing
// ever leaves the browser.
// WHAT STAYS AVAILABLE: login, session validation, getMenu, all reads, and the
// read-only POST computations below. The draft must remain fully explorable —
// a lock that also breaks the planner would make the visual acceptance pass
// impossible, which is the opposite of the point.
// ===============================================================

export const DRAFT_NO_PERSIST = process.env.REACT_APP_DRAFT_NO_PERSIST === "true";

// POST actions that compute and return a result WITHOUT writing anything.
// They must keep working under the lock or the picker/planner surfaces the user
// is meant to evaluate would be dead.
export const READ_ONLY_POST_ACTIONS = new Set([
  "previewOrderPlanner",
  "previewOrderTiming",
  "previewStrategicOpportunities",
  "previewManualGiroRoute",
]);

// The notice shown ON the final mutation controls in a draft build, so the
// operator sees why nothing saves before clicking, not after.
export const DRAFT_NOTICE = "Borrador de prueba — no se guardarán cambios";

export class DraftWriteBlockedError extends Error {
  constructor(what) {
    super(`[DRAFT · SIN GUARDAR] Escritura bloqueada: ${what}. ` +
          `Este draft no persiste datos.`);
    this.name = "DraftWriteBlockedError";
    this.draftBlocked = true;
    this.what = what;
  }
}

// Every blocked attempt is recorded so the draft can be audited after a manual
// pass ("did anything try to write?") without any network trace.
const blocked = [];
export function getBlockedWrites() { return blocked.slice(); }
export function _resetBlockedWrites() { blocked.length = 0; }

function record(what) {
  const entry = { what, at: new Date().toISOString() };
  blocked.push(entry);
  try {
    console.warn(`[DRAFT · SIN GUARDAR] blocked write: ${what}`);
    window.dispatchEvent(new CustomEvent("ld-draft-write-blocked", { detail: entry }));
  } catch (e) { /* non-browser context */ }
}

// True when this call is a mutation that must not reach the network.
export function isBlockedMutation(what) {
  if (!DRAFT_NO_PERSIST) return false;
  return !READ_ONLY_POST_ACTIONS.has(what);
}

// Throws before the fetch when the lock is active. Callers that prefer a soft
// failure can use isBlockedMutation() instead.
export function assertMutationAllowed(what) {
  if (!isBlockedMutation(what)) return;
  record(what);
  throw new DraftWriteBlockedError(what);
}

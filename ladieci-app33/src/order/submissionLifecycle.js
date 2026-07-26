// ===============================================================
// submissionLifecycle.js — S2-7D4E-A (Root Cause R1)
//
// ONE canonical lifecycle for "confirm this order", shared by every modal that
// performs final persistence.
//
// WHY THIS EXISTS
// The previous flow was a chain of early returns at the top of a click handler.
// Each new gate (planner block, closing time, distant time, draft mode) was added
// as another `return`, so a click could end in NO state change at all: no spinner,
// no message, no close. That is exactly what "Confirmar does nothing" was.
//
// Two rules follow, and they are the whole point of this module:
//   1. NO branch may end an attempt without producing an observable phase.
//   2. Form readiness ("the fields are valid") is NOT submission success. They are
//      different things and are never represented by the same value.
//
// This module is pure: no React, no fetch, no env. Everything it needs is
// injected, so the whole lifecycle is unit-testable without a browser.
// ===============================================================

export const PHASE = {
  IDLE: "idle",
  VALIDATING: "validating",
  REQUIRES_CONFIRMATION: "requires_confirmation",
  SUBMITTING: "submitting",
  BLOCKED: "blocked",
  SUCCESS: "success",
  ERROR: "error",
};

// Feedback severities, so the view can style without re-deriving meaning.
export const TONE = { INFO: "info", WARN: "warn", ERROR: "error", SUCCESS: "success" };

export const initialSubmissionState = {
  phase: PHASE.IDLE,
  // The immutable snapshot of the attempt in flight (null when idle).
  attempt: null,
  // Single feedback surface: { tone, message, code } | null.
  feedback: null,
  // Why a confirmation is being asked, when phase === REQUIRES_CONFIRMATION.
  confirmation: null,
  // Structured error detail for retry/telemetry.
  error: null,
  // Monotonic counter: lets the view re-trigger an animation for a REPEATED
  // identical message without stacking a second surface.
  feedbackSeq: 0,
};

export const ACTION = {
  ATTEMPT_STARTED: "ATTEMPT_STARTED",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  CONFIRMATION_REQUIRED: "CONFIRMATION_REQUIRED",
  CONFIRMATION_REJECTED: "CONFIRMATION_REJECTED",
  SUBMIT_STARTED: "SUBMIT_STARTED",
  RESULT_SUCCESS: "RESULT_SUCCESS",
  RESULT_BLOCKED: "RESULT_BLOCKED",
  RESULT_ERROR: "RESULT_ERROR",
  RESET: "RESET",
};

const withFeedback = (state, patch, feedback) => ({
  ...state,
  ...patch,
  feedback,
  feedbackSeq: feedback ? state.feedbackSeq + 1 : state.feedbackSeq,
});

export function submissionReducer(state = initialSubmissionState, action) {
  switch (action.type) {
    case ACTION.ATTEMPT_STARTED:
      // A new attempt always clears the previous outcome, so a stale "blocked"
      // banner can never be mistaken for the result of the click just made.
      return {
        ...initialSubmissionState,
        feedbackSeq: state.feedbackSeq,
        phase: PHASE.VALIDATING,
        attempt: action.attempt,
      };

    case ACTION.VALIDATION_FAILED:
      // Back to idle, but NEVER silently: a visible reason is mandatory.
      return withFeedback(state, { phase: PHASE.IDLE, attempt: null }, {
        tone: TONE.WARN,
        code: action.code || "validation_failed",
        message: action.message,
      });

    case ACTION.CONFIRMATION_REQUIRED:
      return { ...state, phase: PHASE.REQUIRES_CONFIRMATION, confirmation: action.confirmation };

    case ACTION.CONFIRMATION_REJECTED:
      // The operator said no. That is a decision, not an error: return to idle
      // with a neutral trace, keeping the order untouched.
      return withFeedback(state, { phase: PHASE.IDLE, attempt: null, confirmation: null }, {
        tone: TONE.INFO,
        code: "confirmation_rejected",
        message: action.message || "Confirmación cancelada.",
      });

    case ACTION.SUBMIT_STARTED:
      return { ...state, phase: PHASE.SUBMITTING, confirmation: null };

    case ACTION.RESULT_SUCCESS:
      return { ...state, phase: PHASE.SUCCESS, feedback: null, error: null };

    case ACTION.RESULT_BLOCKED:
      // Blocked is an OUTCOME, not an exception. The order stays intact and
      // editable; the modal stays open; the operator is told why.
      return withFeedback(state, { phase: PHASE.BLOCKED, error: null }, {
        tone: TONE.INFO,
        code: action.code || "blocked",
        message: action.message,
      });

    case ACTION.RESULT_ERROR:
      return withFeedback(state, {
        phase: PHASE.ERROR,
        error: { code: action.code || "error", detail: action.detail || null },
      }, { tone: TONE.ERROR, code: action.code || "error", message: action.message });

    case ACTION.RESET:
      return { ...initialSubmissionState, feedbackSeq: state.feedbackSeq };

    default:
      return state;
  }
}

// ── Derived view helpers ─────────────────────────────────────────────────────
// The button asks these; it never inspects phase strings itself.

export const isBusy = (s) =>
  s.phase === PHASE.VALIDATING || s.phase === PHASE.REQUIRES_CONFIRMATION || s.phase === PHASE.SUBMITTING;

// True while an attempt owns the form. Timing effects consult this so a
// background recommendation cannot rewrite the time under the operator's click.
export const attemptOwnsForm = (s) => isBusy(s) || s.phase === PHASE.BLOCKED;

// BLOCKED and ERROR are terminal-but-retryable: the action must be pressable
// again, otherwise a blocked draft would trap the operator.
export const canRetry = (s) => s.phase === PHASE.BLOCKED || s.phase === PHASE.ERROR;

// ── The canonical event order ────────────────────────────────────────────────
// Steps 1..11 of the S2-7D4E-A contract, in one place, with every exit path
// dispatching an observable outcome. Collaborators are injected:
//
//   lock            { acquire(): boolean, release(): void }   sync double-click lock
//   dispatch        (action) => void
//   buildSnapshot   () => immutable attempt snapshot
//   validate        (snap) => null | { code?, message }
//   checkBlocking   (snap) => null | { code?, message }        e.g. planner gate
//   collectConfirmations (snap) => [{ code, message }]         business questions
//   askConfirmation async ({code,message}) => boolean
//   persist         async (snap) => typed gateway result
//
// Returns the final phase, which makes it trivially assertable in tests.
export async function runSubmission({
  lock,
  dispatch,
  buildSnapshot,
  validate,
  checkBlocking,
  collectConfirmations,
  askConfirmation,
  persist,
}) {
  // 1. synchronous attempt lock — rejects the second of a double click before
  //    any await, which is the only point where React state is too slow.
  if (!lock.acquire()) return null;
  try {
    // 2. immutable snapshot: everything the attempt will use is frozen here, so
    //    async background updates cannot change what is being submitted.
    const attempt = Object.freeze(buildSnapshot());
    dispatch({ type: ACTION.ATTEMPT_STARTED, attempt });

    // 3-4. validation
    const invalid = validate ? validate(attempt) : null;
    if (invalid) {
      dispatch({ type: ACTION.VALIDATION_FAILED, code: invalid.code, message: invalid.message });
      return PHASE.IDLE;
    }

    // 5. blocking conditions (planner). Surfaced as a visible reason, not a
    //    bare return like before.
    const blocked = checkBlocking ? checkBlocking(attempt) : null;
    if (blocked) {
      dispatch({ type: ACTION.VALIDATION_FAILED, code: blocked.code || "planner_blocked", message: blocked.message });
      return PHASE.IDLE;
    }

    // 6. business confirmations — their answer feeds the machine explicitly.
    const questions = collectConfirmations ? collectConfirmations(attempt) || [] : [];
    for (const q of questions) {
      dispatch({ type: ACTION.CONFIRMATION_REQUIRED, confirmation: q });
      const accepted = askConfirmation ? await askConfirmation(q) : true;
      if (!accepted) {
        dispatch({ type: ACTION.CONFIRMATION_REJECTED, message: q.rejectMessage });
        return PHASE.IDLE;
      }
    }

    // 7-8. submit through the persistence gateway
    dispatch({ type: ACTION.SUBMIT_STARTED });
    const result = await persist(attempt);

    // 9-10. exactly one typed result → exactly one observable state
    if (!result || result.status === "error") {
      dispatch({
        type: ACTION.RESULT_ERROR,
        code: result?.code || "persist_failed",
        message: result?.message || "No se pudo guardar el pedido. Inténtalo de nuevo.",
        detail: result?.detail || null,
      });
      return PHASE.ERROR;
    }
    if (result.status === "blocked") {
      dispatch({ type: ACTION.RESULT_BLOCKED, code: result.code, message: result.message });
      return PHASE.BLOCKED;
    }
    dispatch({ type: ACTION.RESULT_SUCCESS });
    return PHASE.SUCCESS;
  } catch (err) {
    // An unexpected throw is still an observable outcome, never a silent stop.
    dispatch({
      type: ACTION.RESULT_ERROR,
      code: "unexpected",
      message: (err && err.message) || "Error inesperado al confirmar.",
      detail: err,
    });
    return PHASE.ERROR;
  } finally {
    // 11. the lock ALWAYS releases, on every path including throws.
    lock.release();
  }
}

// S2-7D4E-A — canonical submission lifecycle.
// The lifecycle is pure and fully injected, so every path is tested here without
// React, without a browser and without any network.

import {
  PHASE, ACTION, submissionReducer, initialSubmissionState,
  runSubmission, isBusy, attemptOwnsForm, canRetry,
} from "./submissionLifecycle";

// A real synchronous lock, same shape the modals use.
const makeLock = () => {
  let held = false;
  return {
    acquire: () => (held ? false : (held = true)),
    release: () => { held = false; },
    get held() { return held; },
  };
};

const collect = () => {
  const seen = [];
  let state = initialSubmissionState;
  const dispatch = (a) => { seen.push(a.type); state = submissionReducer(state, a); };
  return { seen, dispatch, get state() { return state; } };
};

const base = (over = {}) => ({
  buildSnapshot: () => ({ hora: "21:00", items: [{ id: 1 }] }),
  persist: async () => ({ status: "success", data: { id: "OK1" } }),
  ...over,
});

describe("happy path", () => {
  test("idle → validating → submitting → success", async () => {
    const c = collect();
    const phase = await runSubmission({ lock: makeLock(), dispatch: c.dispatch, ...base() });
    expect(c.seen).toEqual([ACTION.ATTEMPT_STARTED, ACTION.SUBMIT_STARTED, ACTION.RESULT_SUCCESS]);
    expect(phase).toBe(PHASE.SUCCESS);
    expect(c.state.phase).toBe(PHASE.SUCCESS);
  });

  test("the submitted snapshot is frozen", async () => {
    let captured = null;
    await runSubmission({
      lock: makeLock(), dispatch: () => {},
      ...base({ persist: async (snap) => { captured = snap; return { status: "success" }; } }),
    });
    expect(Object.isFrozen(captured)).toBe(true);
  });
});

describe("blocked (draft)", () => {
  test("validation runs BEFORE blocking — the real flow is exercised", async () => {
    const order = [];
    const c = collect();
    await runSubmission({
      lock: makeLock(), dispatch: c.dispatch,
      ...base({
        validate: () => { order.push("validate"); return null; },
        checkBlocking: () => { order.push("blocking"); return null; },
        collectConfirmations: () => { order.push("confirmations"); return []; },
        persist: async () => { order.push("persist"); return { status: "blocked", code: "draft_no_persist", message: "Borrador de prueba — no se guardarán cambios" }; },
      }),
    });
    // This ordering is the entire point of the block: draft mode must not
    // short-circuit validation the way the old top-of-handler guard did.
    expect(order).toEqual(["validate", "blocking", "confirmations", "persist"]);
  });

  test("blocked is an outcome, not an error, and carries the Spanish message", async () => {
    const c = collect();
    const phase = await runSubmission({
      lock: makeLock(), dispatch: c.dispatch,
      ...base({ persist: async () => ({ status: "blocked", code: "draft_no_persist", message: "Borrador de prueba — no se guardarán cambios" }) }),
    });
    expect(phase).toBe(PHASE.BLOCKED);
    expect(c.state.feedback.message).toBe("Borrador de prueba — no se guardarán cambios");
    expect(c.state.feedback.tone).toBe("info");
    expect(c.state.error).toBeNull();
    expect(canRetry(c.state)).toBe(true);
  });

  test("repeated blocked attempts do not stack feedback", async () => {
    let state = initialSubmissionState;
    const dispatch = (a) => { state = submissionReducer(state, a); };
    const persist = async () => ({ status: "blocked", code: "draft_no_persist", message: "Borrador de prueba — no se guardarán cambios" });
    for (let i = 0; i < 3; i++) {
      await runSubmission({ lock: makeLock(), dispatch, ...base({ persist }) });
    }
    // one surface, not three: a single feedback object, with a bumped sequence
    expect(state.feedback).toEqual(expect.objectContaining({ code: "draft_no_persist" }));
    expect(state.feedbackSeq).toBeGreaterThan(1);
  });
});

describe("no branch exits silently", () => {
  test("validation failure returns to idle WITH a visible reason", async () => {
    const c = collect();
    const phase = await runSubmission({
      lock: makeLock(), dispatch: c.dispatch,
      ...base({ validate: () => ({ code: "incomplete", message: "Faltan datos del pedido." }) }),
    });
    expect(phase).toBe(PHASE.IDLE);
    expect(c.state.feedback.message).toBe("Faltan datos del pedido.");
    expect(c.seen).not.toContain(ACTION.SUBMIT_STARTED);
  });

  test("planner block surfaces a reason instead of returning silently", async () => {
    const c = collect();
    await runSubmission({
      lock: makeLock(), dispatch: c.dispatch,
      ...base({ checkBlocking: () => ({ code: "planner_blocked", message: "El planner bloquea esta hora." }) }),
    });
    expect(c.state.feedback.code).toBe("planner_blocked");
    expect(c.state.phase).toBe(PHASE.IDLE);
  });

  test("a persist that throws still produces a visible error", async () => {
    const c = collect();
    const phase = await runSubmission({
      lock: makeLock(), dispatch: c.dispatch,
      ...base({ persist: async () => { throw new Error("boom"); } }),
    });
    expect(phase).toBe(PHASE.ERROR);
    expect(c.state.feedback.tone).toBe("error");
  });
});

describe("business confirmations", () => {
  const q = { code: "distant_time", message: "muy lejana", rejectMessage: "cancelada" };

  test("accepted → submission proceeds", async () => {
    const c = collect();
    const phase = await runSubmission({
      lock: makeLock(), dispatch: c.dispatch,
      ...base({ collectConfirmations: () => [q], askConfirmation: async () => true }),
    });
    expect(c.seen).toContain(ACTION.CONFIRMATION_REQUIRED);
    expect(phase).toBe(PHASE.SUCCESS);
  });

  test("rejected → no submission, visible trace, order untouched", async () => {
    const c = collect();
    let persisted = false;
    const phase = await runSubmission({
      lock: makeLock(), dispatch: c.dispatch,
      ...base({
        collectConfirmations: () => [q],
        askConfirmation: async () => false,
        persist: async () => { persisted = true; return { status: "success" }; },
      }),
    });
    expect(persisted).toBe(false);
    expect(phase).toBe(PHASE.IDLE);
    expect(c.state.feedback.message).toBe("cancelada");
  });
});

describe("error and retry", () => {
  test("error then a successful retry", async () => {
    let state = initialSubmissionState;
    const dispatch = (a) => { state = submissionReducer(state, a); };
    await runSubmission({ lock: makeLock(), dispatch, ...base({ persist: async () => ({ status: "error", code: "net", message: "sin red" }) }) });
    expect(state.phase).toBe(PHASE.ERROR);
    expect(canRetry(state)).toBe(true);
    await runSubmission({ lock: makeLock(), dispatch, ...base() });
    expect(state.phase).toBe(PHASE.SUCCESS);
  });
});

describe("attempt lock", () => {
  test("a second concurrent click is rejected", async () => {
    const lock = makeLock();
    let calls = 0;
    const slow = base({ persist: async () => { calls++; await new Promise(r => setTimeout(r, 20)); return { status: "success" }; } });
    const [a, b] = await Promise.all([
      runSubmission({ lock, dispatch: () => {}, ...slow }),
      runSubmission({ lock, dispatch: () => {}, ...slow }),
    ]);
    expect(calls).toBe(1);
    expect([a, b].filter(Boolean)).toHaveLength(1); // the rejected one returns null
  });

  test.each([
    ["success", base()],
    ["blocked", base({ persist: async () => ({ status: "blocked", code: "b", message: "m" }) })],
    ["error",   base({ persist: async () => { throw new Error("x"); } })],
    ["invalid", base({ validate: () => ({ message: "no" }) })],
  ])("lock is released after %s", async (_label, cfg) => {
    const lock = makeLock();
    await runSubmission({ lock, dispatch: () => {}, ...cfg });
    expect(lock.held).toBe(false);
  });
});

describe("derived view state", () => {
  test("busy covers validating, confirming and submitting", () => {
    for (const p of [PHASE.VALIDATING, PHASE.REQUIRES_CONFIRMATION, PHASE.SUBMITTING]) {
      expect(isBusy({ phase: p })).toBe(true);
    }
    for (const p of [PHASE.IDLE, PHASE.BLOCKED, PHASE.SUCCESS, PHASE.ERROR]) {
      expect(isBusy({ phase: p })).toBe(false);
    }
  });

  // Time ownership: the attempt owns the form while busy AND while showing a
  // blocked result, so a background recommendation cannot rewrite the time the
  // operator just tried to confirm.
  test("attempt owns the form while busy or blocked", () => {
    expect(attemptOwnsForm({ phase: PHASE.SUBMITTING })).toBe(true);
    expect(attemptOwnsForm({ phase: PHASE.BLOCKED })).toBe(true);
    expect(attemptOwnsForm({ phase: PHASE.IDLE })).toBe(false);
    expect(attemptOwnsForm({ phase: PHASE.SUCCESS })).toBe(false);
  });

  test("a new attempt clears the previous outcome", () => {
    let s = submissionReducer(initialSubmissionState, { type: ACTION.RESULT_BLOCKED, code: "b", message: "m" });
    expect(s.feedback).not.toBeNull();
    s = submissionReducer(s, { type: ACTION.ATTEMPT_STARTED, attempt: {} });
    expect(s.feedback).toBeNull();
    expect(s.phase).toBe(PHASE.VALIDATING);
  });
});

// UNKNOWN_ACTION finding, traced during the Fase 4 Mesa E2E cycle.
//
// During "Nueva comanda" (NuevoPedidoModal.jsx, reused by Mesa's table-order
// flow), two `POST /api/proxy` calls came back {"error":"UNKNOWN_ACTION"} on
// real staging. Traced to api.previewOrderPlanner() (api.js, action:
// "previewOrderPlanner"), called from NuevoPedidoModal.jsx around the same
// "input rilevante" evaluation that also calls api.previewOrderTiming()
// (which the backend DOES recognize and answers correctly). Comment at
// NuevoPedidoModal.jsx:8 says "previewOrderPlanner appena deployato" --
// this is a genuinely incomplete rollout: the frontend caller shipped, the
// backend action handler for it never did.
//
// Classification: harmless-but-noisy. The call is read-only (a preview), its
// failure is caught and only console.warn'd (NuevoPedidoModal.jsx has its own
// `catch` around this call already), and it never blocked, corrupted, or
// duplicated the real order (confirmed live: the Mesa order created cleanly
// with correct products/price/note despite this call failing both times).
// api.previewStrategicOpportunities and api.previewManualGiroRoute share the
// exact same gap (present in api.js, absent from the backend's action
// dispatcher) but were not observed firing during this specific flow.
//
// This is independent of the AUTH_BOOTSTRAP_ORDERS_RETRY_BUG fixed in
// App.jsx (unrelated code path, unrelated root cause: a missing backend
// contract, not a frontend auth-timing race) and is NOT fixed here --
// implementing three backend preview endpoints is a real feature addition,
// not a minimal fix, and is out of scope for this commit. This test is a
// regression marker: it fails (forcing this gap back into view) the moment
// either side of the mismatch changes, so it can't silently drift further.
const fs = require("fs");
const path = require("path");

const apiSrc = fs.readFileSync(path.join(__dirname, "api.js"), "utf8");

describe("previewOrderPlanner / previewStrategicOpportunities / previewManualGiroRoute", () => {
  test("all three are still called by the frontend with these exact action names", () => {
    expect(apiSrc).toMatch(/action:\s*'previewOrderPlanner'/);
    expect(apiSrc).toMatch(/action:\s*'previewStrategicOpportunities'/);
    expect(apiSrc).toMatch(/action:\s*'previewManualGiroRoute'/);
  });

  test("previewOrderTiming (the sibling call that DOES work) is called from the same modal", () => {
    const modalSrc = fs.readFileSync(path.join(__dirname, "components", "NuevoPedidoModal.jsx"), "utf8");
    expect(modalSrc).toMatch(/api\.previewOrderTiming\(/);
    expect(modalSrc).toMatch(/api\.previewOrderPlanner\(/);
  });

  test("the failure is caught locally and never thrown into the order-submit flow", () => {
    const modalSrc = fs.readFileSync(path.join(__dirname, "components", "NuevoPedidoModal.jsx"), "utf8");
    const callIdx = modalSrc.indexOf("api.previewOrderPlanner(");
    const nearby = modalSrc.slice(callIdx, callIdx + 1200);
    expect(nearby).toMatch(/catch/);
    expect(nearby).toMatch(/console\.warn\(["'`]\[previewOrderPlanner\]/);
  });
});

// NOTE for whoever picks this up: the backend repository's index.js has no
// `action === "previewOrderPlanner"` (or previewStrategicOpportunities /
// previewManualGiroRoute) branch -- confirmed by grepping its full
// `action === "..."` dispatch table during this investigation. That
// repository is not reachable from this frontend repo's test run, so that
// half of the contract can't be asserted here; this file only pins the
// frontend side so the gap stays visible until someone deliberately
// resolves it (implements the backend handlers, or removes the calls).

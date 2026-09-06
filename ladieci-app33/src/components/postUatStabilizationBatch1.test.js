// ===============================================================
// POST-UAT STABILIZATION BATCH 1 — regression guards for the six defects
// found during the 2026-08-20 Normal Service UAT on staging.
//
// These are source-level structural tests, matching the convention already
// used by TabMesa.test.js: they assert the rules that were violated, so a
// future edit cannot silently re-introduce any of them.
// ===============================================================

const fs = require("fs");
const path = require("path");

const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
const SERVICIO = read("ServicioPage.jsx");
// STALE SERVICE PROTECTION V1 (2026-09-06) — the Finalizar confirmation modal
// moved verbatim into this shared component (also mounted by
// ServiceExceptionPanel). TEST H's copy-truth assertions follow it here.
const FINALIZAR_MODAL = read("servicio/FinalizarServicioModal.jsx");
const TAB_BANCO = read("ordenes/TabBanco.jsx");
const TAB_LISTOS = read("ordenes/TabListos.jsx");
const TAB_MESA = read("mesa/TabMesa.jsx");

// Executable source only. The fixes above are documented with comments that
// legitimately QUOTE the wrong copy they replaced ("Annulla", "Cuenta
// cerrada.", "anular pedidos activos"), so a raw scan for those strings would
// flag the very comment that explains why they are gone. Absence assertions
// therefore run against code with comments stripped; presence assertions keep
// using the raw source.
const codeOnly = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const SERVICIO_CODE = codeOnly(SERVICIO);
const FINALIZAR_MODAL_CODE = codeOnly(FINALIZAR_MODAL);
const TAB_MESA_CODE = codeOnly(TAB_MESA);
const TAB_LISTOS_CODE = codeOnly(TAB_LISTOS);

// ── TEST A — Mesa and Barra coexist as distinct surfaces ─────────────────
describe("TEST A: Mesa and Barra are distinct operator surfaces", () => {
  test("a dedicated Barra tab is registered when Mesa is enabled", () => {
    expect(SERVICIO).toContain('{id:"barra"');
    expect(SERVICIO).toContain('label:"Barra"');
    // Added only under the Mesa flag, so the Mesa-disabled build is unchanged.
    expect(SERVICIO).toMatch(/\.\.\.\(MESA_UI_ENABLED \? \[\{id:"barra"/);
  });

  test("the Barra tab renders TabBanco, so BANCO orders stay reachable", () => {
    expect(SERVICIO).toMatch(/if\(tab==="barra"\) return <TabBanco/);
  });

  test("Mesa keeps its own slot and does not replace Barra", () => {
    // Mesa still owns the historic "banco" id (MesaPhoneShell keys on it)...
    expect(SERVICIO).toContain('const showMesaPhoneShell = MESA_UI_ENABLED && headerPhone && tab === "banco"');
    // ...and the two ids are different, so neither can shadow the other.
    expect(SERVICIO).toMatch(/if\(tab==="banco"\)\s+return MESA_UI_ENABLED/);
  });

  test("the Barra badge counts only non-table BANCO orders", () => {
    expect(SERVICIO).toMatch(/\{id:"barra"[^}]*badge:\{n:bancoN/);
    expect(SERVICIO).toMatch(/bancoN\s*=\s*useMemo\(\(\) => ordenes\.filter\(o=>o\.canal==="BANCO" && !o\.table_session_id/);
  });

  test("TabBanco excludes Mesa comandas, which are also canal=BANCO", () => {
    expect(TAB_BANCO).toContain('o.canal==="BANCO" && !o.table_session_id');
  });
});

// ── TEST B — Barra create exits cleanly ──────────────────────────────────
describe("TEST B: a successful Barra order closes the form", () => {
  const bancoBranch = SERVICIO.slice(
    SERVICIO.indexOf('} else if (snapshot.canal==="BANCO") {'),
    SERVICIO.indexOf('return true;', SERVICIO.indexOf('} else if (snapshot.canal==="BANCO") {')),
  );

  test("the BANCO branch dismisses the modal, like MANUAL already did", () => {
    expect(bancoBranch).toContain("setShowNuevo(false)");
    expect(bancoBranch).toContain("setPrefillCliente(null)");
  });

  test("it lands the operator on the Barra surface, not on Mesa", () => {
    expect(bancoBranch).toContain('setTab(MESA_UI_ENABLED ? "barra" : "banco")');
  });

  test("success is still gated on a real persisted id (no masked failure)", () => {
    // N-3 widened the thrown message to prefer the backend's operator sentence, but the
    // gate itself is unchanged: no id, or any typed failure, still throws.
    expect(SERVICIO).toContain('if (!res?.id || res._ok === false || res.error || res.success === false)');
    expect(SERVICIO).toContain('throw new Error(res?.message || res?.error || "createOrden returned no persisted id")');
  });
});

// ── TEST E — occupancy is visually distinct ──────────────────────────────
describe("TEST E: free / occupied / reserved are materially distinct", () => {
  test("the three states carry three different fills", () => {
    const colors = ["#22C55E", "#EAB308", "#EF4444"].map((c) => TAB_MESA.includes(c));
    expect(colors).toEqual([true, true, true]);
  });

  test("an occupied table never borrows the free-table colour", () => {
    const border = TAB_MESA.slice(TAB_MESA.indexOf("function tableBorder"), TAB_MESA.indexOf("function hasReadyOrder"));
    expect(border).not.toContain("#22C55E");
    expect(border).toContain("OCCUPIED_BORDER_ACTIVE");
    expect(border).toContain("OCCUPIED_BORDER_IDLE");
  });

  test("both occupied variants stay outside the free-green family", () => {
    expect(TAB_MESA).toContain('const OCCUPIED_BORDER_IDLE = "#EF4444"');
    expect(TAB_MESA).toContain('const OCCUPIED_BORDER_ACTIVE = "#F97316"');
    expect(TAB_MESA).toContain('free: { label: "Libre", color: "#22C55E"');
  });

  test("occupancy is still driven by real backend state", () => {
    expect(TAB_MESA).toContain('if (table.status === "open") return STATUS.occupied');
  });
});

// ── TESTS F and G — kitchen timing semantics ─────────────────────────────
describe("TEST F/G: pickup lateness belongs to takeaway, never to dine-in", () => {
  test("dine-in is identified by its table session", () => {
    expect(TAB_LISTOS).toContain("const isDineIn = (o) => Boolean(o && o.table_session_id)");
  });

  test("TEST F: a dine-in comanda never enters the promised-time countdown", () => {
    expect(TAB_LISTOS).toContain("if(o.hora && !dineIn)");
  });

  test("TEST F: a dine-in comanda can never reach the 'tarde' phase", () => {
    expect(TAB_LISTOS).toContain('if(mm >= 15 && !dineIn) fase = "tarde"');
    expect(TAB_LISTOS).toContain("const scaduto = mm>=15 && !dineIn");
  });

  test("TEST G: takeaway keeps its countdown and its late transition", () => {
    // The promised-time branch is intact for everything that is not dine-in.
    expect(TAB_LISTOS).toContain("const ritiroMs = orarioToMs(o.hora, now)"); // language-guard: allow-legacy ritiroMs is the existing TabListos variable name, quoted verbatim to prove the takeaway countdown survived, not new vocabulary
    expect(TAB_LISTOS).toContain('if(scaduto)       fase = "tarde";');
    expect(TAB_LISTOS).toContain('else if(mm < 6)   fase = "al_horno";');
  });

  test("no frontend date/timezone rule was introduced", () => {
    const added = TAB_LISTOS_CODE.slice(TAB_LISTOS_CODE.indexOf("const isDineIn"), TAB_LISTOS_CODE.indexOf("const calcTimer"));
    expect(added).not.toMatch(/Madrid|toLocale|getTimezoneOffset/);
  });
});

// ── TEST H — Finalizar copy tells the truth ──────────────────────────────
describe("TEST H: Finalizar copy never promises a cancellation", () => {
  test("the pending-orders action no longer claims to anular them", () => {
    expect(SERVICIO_CODE).not.toContain("Cerrar y anular pedidos activos");
    expect(FINALIZAR_MODAL_CODE).not.toContain("Cerrar y anular pedidos activos");
    expect(FINALIZAR_MODAL).toContain("Finalizar servicio con pendientes");
  });

  test("the explanatory line describes incidents, not cancellation", () => {
    expect(FINALIZAR_MODAL_CODE).not.toContain("ciérralos expresamente como anulados");
    expect(FINALIZAR_MODAL).toMatch(/[Ss]e registrarán como incidencias del cierre/);
  });

  test("SMOKE FIX — an unresolved order is not described as money owed unless it is", () => {
    // An order can be POR_CONFIRMAR and already PAID. The backend files exactly
    // that as an operational incident with financial exposure null, so the old
    // blanket "con su importe pendiente" was false for it. Operational pending
    // and financial exposure are two different claims.
    // *_CODE, not raw: the comment above the fixed line quotes the old wording
    // verbatim to explain why it was wrong, and a prose mention is not a UI
    // string. This is the same reason the comment-stripped copy exists.
    expect(FINALIZAR_MODAL_CODE).not.toContain("con su importe pendiente");
    expect(FINALIZAR_MODAL_CODE).toContain("Las que estén cobradas no dejan importe pendiente");
  });

  test("no surviving UI string promises automatic cancellation on close", () => {
    expect(SERVICIO_CODE).not.toMatch(/anular pedidos/i);
    expect(FINALIZAR_MODAL_CODE).not.toMatch(/anular pedidos/i);
  });

  test("the Finalizar action is nameable, and Cancelar is Spanish", () => {
    // The bottom-bar button that opens the flow stays in ServicioPage…
    expect(SERVICIO).toContain('aria-label="Finalizar servicio"');
    // …the modal it opens lives in the shared component now.
    expect(FINALIZAR_MODAL_CODE).not.toContain('"Annulla"');
    expect(FINALIZAR_MODAL).toContain('"Cancelar"');
  });

  test("paying a table no longer claims the table was closed", () => {
    expect(TAB_MESA_CODE).not.toContain('"Cuenta cerrada."');
    expect(TAB_MESA).toContain("Cuenta pagada. Cierra la mesa para liberarla.");
  });
});

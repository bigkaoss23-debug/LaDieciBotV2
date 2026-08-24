// Test puro di parseEstadoTerminalError.
// Node puro, no Jest, no rete, no DB, no .env.
// Esecuzione: node ladieci-app33/src/utils/orderModifyError.standalone.js

const { parseEstadoTerminalError } = require("./orderModifyError");

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log("PASS  " + name); }
  else    { fail++; console.log("FAIL  " + name + (detail ? " — " + detail : "")); }
};
const eq = (got, want) =>
  got && got.blocked === want.blocked && got.estado === want.estado && got.message === want.message;

const EMPTY = { blocked: false, estado: null, message: "" };

// ---- 1) input degenerati -----------------------------------------------------
check("null → not blocked",       eq(parseEstadoTerminalError(null), EMPTY));
check("undefined → not blocked",  eq(parseEstadoTerminalError(undefined), EMPTY));
check("stringa → not blocked",    eq(parseEstadoTerminalError("estado_terminal"), EMPTY));
check("array → not blocked",      eq(parseEstadoTerminalError([{success:false,error:"estado_terminal"}]), EMPTY));
check("number → not blocked",     eq(parseEstadoTerminalError(42), EMPTY));
check("oggetto vuoto → not blocked", eq(parseEstadoTerminalError({}), EMPTY));

// ---- 2) successi / altri errori ---------------------------------------------
check("{success:true} → not blocked",
  eq(parseEstadoTerminalError({ success: true }), EMPTY));
check("{success:true, error:'estado_terminal'} → not blocked (success vince)",
  eq(parseEstadoTerminalError({ success: true, error: "estado_terminal" }), EMPTY));
check("{success:false, error:'otro'} → not blocked",
  eq(parseEstadoTerminalError({ success: false, error: "otro" }), EMPTY));
check("{success:false, error:undefined} → not blocked",
  eq(parseEstadoTerminalError({ success: false }), EMPTY));

// ---- 3) blocked con estado --------------------------------------------------
check("EN_ENTREGA → blocked + message con stato",
  eq(parseEstadoTerminalError({ success: false, error: "estado_terminal", estado: "EN_ENTREGA" }),
     { blocked: true, estado: "EN_ENTREGA", message: "Pedido en EN_ENTREGA — no se puede modificar" }));
check("RETIRADO → blocked",
  eq(parseEstadoTerminalError({ success: false, error: "estado_terminal", estado: "RETIRADO" }),
     { blocked: true, estado: "RETIRADO", message: "Pedido en RETIRADO — no se puede modificar" }));
check("COMPLETADO → blocked",
  eq(parseEstadoTerminalError({ success: false, error: "estado_terminal", estado: "COMPLETADO" }),
     { blocked: true, estado: "COMPLETADO", message: "Pedido en COMPLETADO — no se puede modificar" }));

// ---- 4) blocked senza estado / estado degenerato ----------------------------
check("blocked senza estado → message generico",
  eq(parseEstadoTerminalError({ success: false, error: "estado_terminal" }),
     { blocked: true, estado: null, message: "Pedido ya entregado o cerrado — no se puede modificar" }));
check("estado: '' → null + message generico",
  eq(parseEstadoTerminalError({ success: false, error: "estado_terminal", estado: "" }),
     { blocked: true, estado: null, message: "Pedido ya entregado o cerrado — no se puede modificar" }));
check("estado: '   ' (whitespace) → null + message generico",
  eq(parseEstadoTerminalError({ success: false, error: "estado_terminal", estado: "   " }),
     { blocked: true, estado: null, message: "Pedido ya entregado o cerrado — no se puede modificar" }));
check("estado non-string (numero) → null + message generico",
  eq(parseEstadoTerminalError({ success: false, error: "estado_terminal", estado: 42 }),
     { blocked: true, estado: null, message: "Pedido ya entregado o cerrado — no se puede modificar" }));
check("estado null esplicito → null + message generico",
  eq(parseEstadoTerminalError({ success: false, error: "estado_terminal", estado: null }),
     { blocked: true, estado: null, message: "Pedido ya entregado o cerrado — no se puede modificar" }));

// ---- 5) immutabilità input ---------------------------------------------------
{
  const input = { success: false, error: "estado_terminal", estado: "EN_ENTREGA" };
  const snapshot = JSON.stringify(input);
  parseEstadoTerminalError(input);
  check("non muta input object", JSON.stringify(input) === snapshot);
}

// ---- 6) campi extra ignorati -------------------------------------------------
check("campi extra non disturbano il parse",
  eq(parseEstadoTerminalError({ success: false, error: "estado_terminal", estado: "RETIRADO", debug: "x", id: "ord-1" }),
     { blocked: true, estado: "RETIRADO", message: "Pedido en RETIRADO — no se puede modificar" }));

// (the run summary + exit now live at the very bottom, after the N-5 section below)

// ═══════════════════════════════════════════════════════════════════════════
// N-5 — parsePaidOrderEconomicRefusal + the combined parseOrderWriteRefusal.
// Same discipline as above: pure, Node-only, no DOM, no network.
// ═══════════════════════════════════════════════════════════════════════════
const {
  parsePaidOrderEconomicRefusal,
  parseOrderWriteRefusal,
  PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN,
  PAID_ORDER_ECONOMIC_MESSAGE,
} = require("./orderModifyError");

const eqEco = (got, want) => got && got.blocked === want.blocked && got.message === want.message;
const NO_ECO = { blocked: false, message: "" };

console.log("");
console.log("── N-5 paid-order economic refusal ──");

// ---- 1) degenerate input --------------------------------------------------
check("N5: null → not blocked",      eqEco(parsePaidOrderEconomicRefusal(null), NO_ECO));
check("N5: undefined → not blocked", eqEco(parsePaidOrderEconomicRefusal(undefined), NO_ECO));
check("N5: string → not blocked",    eqEco(parsePaidOrderEconomicRefusal(PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN), NO_ECO));
check("N5: array → not blocked",     eqEco(parsePaidOrderEconomicRefusal([{ error: PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN }]), NO_ECO));
check("N5: {} → not blocked",        eqEco(parsePaidOrderEconomicRefusal({}), NO_ECO));

// ---- 2) the real backend shapes -------------------------------------------
check("N5: `error` carries the code → blocked, backend message wins",
  eqEco(parsePaidOrderEconomicRefusal({ success: false, error: PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN, message: "Mensaje del backend." }),
        { blocked: true, message: "Mensaje del backend." }));
check("N5: `code` alone is enough (both conventions accepted)",
  eqEco(parsePaidOrderEconomicRefusal({ code: PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN }),
        { blocked: true, message: PAID_ORDER_ECONOMIC_MESSAGE }));
check("N5: no message → local Spanish copy, never a raw code",
  eqEco(parsePaidOrderEconomicRefusal({ success: false, error: PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN }),
        { blocked: true, message: PAID_ORDER_ECONOMIC_MESSAGE }));
check("N5: blank backend message falls back rather than showing nothing",
  eqEco(parsePaidOrderEconomicRefusal({ code: PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN, message: "   " }),
        { blocked: true, message: PAID_ORDER_ECONOMIC_MESSAGE }));

// ---- 3) must not fire on successes or other errors ------------------------
check("N5: success:true is never a refusal",
  eqEco(parsePaidOrderEconomicRefusal({ success: true, code: PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN }), NO_ECO));
check("N5: a terminal-state refusal is NOT an economic refusal",
  eqEco(parsePaidOrderEconomicRefusal({ success: false, error: "estado_terminal", estado: "RETIRADO" }), NO_ECO));
check("N5: an unrelated error is not a refusal",
  eqEco(parsePaidOrderEconomicRefusal({ success: false, error: "otro" }), NO_ECO));

// ---- 4) input is not mutated ----------------------------------------------
{
  const input = { success: false, code: PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN, message: "x" };
  const snapshot = JSON.stringify(input);
  parsePaidOrderEconomicRefusal(input);
  check("N5: non muta input object", JSON.stringify(input) === snapshot);
}

console.log("");
console.log("── N-5 combined resolver (what the UI actually calls) ──");
check("combined: terminal state still resolves exactly as before",
  eqEco(parseOrderWriteRefusal({ success: false, error: "estado_terminal", estado: "EN_ENTREGA" }),
        { blocked: true, message: "Pedido en EN_ENTREGA — no se puede modificar" }));
check("combined: the economic refusal resolves to its own sentence",
  eqEco(parseOrderWriteRefusal({ success: false, error: PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN }),
        { blocked: true, message: PAID_ORDER_ECONOMIC_MESSAGE }));
check("combined: the two messages are genuinely different (no copy collision)",
  parseOrderWriteRefusal({ success: false, error: "estado_terminal", estado: "RETIRADO" }).message
    !== parseOrderWriteRefusal({ success: false, error: PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN }).message);
check("combined: a success passes through unblocked",
  eqEco(parseOrderWriteRefusal({ success: true }), NO_ECO));
check("combined: null passes through unblocked",
  eqEco(parseOrderWriteRefusal(null), NO_ECO));
check("combined: terminal-state result still exposes `estado` for existing callers",
  parseOrderWriteRefusal({ success: false, error: "estado_terminal", estado: "RETIRADO" }).estado === "RETIRADO");
check("combined: an economic refusal has no estado (it is not a state problem)",
  parseOrderWriteRefusal({ success: false, error: PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN }).estado === null);

console.log("");
console.log("Totale N-5 incluso: " + (pass + fail) + " | PASS: " + pass + " | FAIL: " + fail);
process.exit(fail === 0 ? 0 : 1);

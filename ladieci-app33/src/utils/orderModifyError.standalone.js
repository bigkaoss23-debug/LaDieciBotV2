// Test puro di parseEstadoTerminalError.
// Node puro, no Jest, no rete, no DB, no .env.
// Esecuzione: node ladieci-app33/src/utils/orderModifyError.standalone.js

const { parseEstadoTerminalError, parseOrderWriteRefusal } = require("./orderModifyError");

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

// ---- 7) parseOrderWriteRefusal — UX-1 fix (ECONOMIC_WRITER_HARDENING_REVIEW_FAIL_FIX_
// REQUIRED, round 2): superset of parseEstadoTerminalError, plus ORDER_ECONOMIC_BASIS_
// LOCKED recognition -------------------------------------------------------------------
console.log("");
check("parseOrderWriteRefusal: null → not blocked", eq(parseOrderWriteRefusal(null), EMPTY));
check("parseOrderWriteRefusal: {success:true} → not blocked",
  eq(parseOrderWriteRefusal({ success: true }), EMPTY));
check("parseOrderWriteRefusal: {success:false, error:'otro'} → not blocked (named codes only, not a blanket success:false rule)",
  eq(parseOrderWriteRefusal({ success: false, error: "otro" }), EMPTY));

check("parseOrderWriteRefusal: estado_terminal still recognised, byte-identical to parseEstadoTerminalError",
  eq(parseOrderWriteRefusal({ success: false, error: "estado_terminal", estado: "RETIRADO" }),
     { blocked: true, estado: "RETIRADO", message: "Pedido en RETIRADO — no se puede modificar" }));

{
  const res = { success: false, error: "ORDER_ECONOMIC_BASIS_LOCKED", code: "ORDER_ECONOMIC_BASIS_LOCKED", id: "#T1",
    message: "No se puede modificar el importe de un pedido de Mesa, ya ajustado, o cancelado/anulado." };
  const got = parseOrderWriteRefusal(res);
  check("parseOrderWriteRefusal: ORDER_ECONOMIC_BASIS_LOCKED → blocked, estado null, backend message preserved verbatim",
    got.blocked === true && got.estado === null
      && got.message === "No se puede modificar el importe de un pedido de Mesa, ya ajustado, o cancelado/anulado.",
    JSON.stringify(got));
}
check("parseOrderWriteRefusal: ORDER_ECONOMIC_BASIS_LOCKED without a message → generic fallback copy",
  eq(parseOrderWriteRefusal({ success: false, error: "ORDER_ECONOMIC_BASIS_LOCKED" }),
     { blocked: true, estado: null, message: "No se puede modificar el importe de este pedido." }));
check("parseOrderWriteRefusal: {success:true, error:'ORDER_ECONOMIC_BASIS_LOCKED'} → not blocked (success wins)",
  eq(parseOrderWriteRefusal({ success: true, error: "ORDER_ECONOMIC_BASIS_LOCKED" }), EMPTY));
check("parseOrderWriteRefusal: array → not blocked", eq(parseOrderWriteRefusal([{ success: false, error: "ORDER_ECONOMIC_BASIS_LOCKED" }]), EMPTY));

// The false-success scenario the review reproduced end-to-end (S1-S4): a real backend
// refusal (409, success:false) must never be read as "not blocked" by the SAME parser the
// UI actually uses for its toast decision.
{
  const backendRefusal = { success: false, error: "ORDER_ECONOMIC_BASIS_LOCKED", id: "#T1",
    message: "No se puede modificar el importe de un pedido de Mesa, ya ajustado, o cancelado/anulado." };
  const parsed = parseOrderWriteRefusal(backendRefusal);
  check("false-success regression: a refused write is never reported as success by the UI's own parser",
    parsed.blocked === true, "parsed.blocked was " + parsed.blocked + " — would show '✏️ Pedido actualizado' on a refused write");
}

console.log("");
console.log("Totale: " + (pass + fail) + " | PASS: " + pass + " | FAIL: " + fail);
process.exit(fail === 0 ? 0 : 1);

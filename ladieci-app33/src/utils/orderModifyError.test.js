// Test puro di parseEstadoTerminalError.
// Node puro, no Jest, no rete, no DB, no .env.
// Esecuzione: node ladieci-app33/src/utils/orderModifyError.test.js

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

console.log("");
console.log("Totale: " + (pass + fail) + " | PASS: " + pass + " | FAIL: " + fail);
process.exit(fail === 0 ? 0 : 1);

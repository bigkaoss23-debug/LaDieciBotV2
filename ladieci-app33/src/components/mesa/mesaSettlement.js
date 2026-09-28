// mesaSettlement — the Mesa floor's per-comanda PAID STATE, read from the backend.
//
// WHY THIS EXISTS (R2, Economy 147). A commercial adjustment changes what a comanda
// OWES (order_obligations) and never its historical lines. Until now every
// "Pagada / Pendiente" on this surface — the Resumen row, the product detail, the
// Payment Hub ticket and the CUENTA CLIENTE rows — was rebuilt here from
// `line.remaining`, the historical line minus its allocations. After
// 100 -> pay 100 -> adjust 80 -> refund 20 the lines still owe 20 while the comanda owes
// nothing, so a settled comanda read "Pendiente" and the bill printed 20,00 € to pay.
//
// THE MONEY IS THE BACKEND'S. `command.settlement` (mesaService.projectSessionAccount)
// carries the canonical facts: currentObligation, netCollected, outstanding,
// overCollected, payState and payableByLines. This module only READS them: no sum of
// lines, no price, no allocation is computed here.
//
// LINES KEEP THEIR OWN MEANING. `line.remaining` is untouched: it is what
// mesa_post_payment_v1 charges for an item_selection. What changes is only WHICH lines
// this surface treats as pending or offers to charge:
//   * a line of a comanda that owes nothing is not pending (the comanda is settled);
//   * a line is chargeable "Por productos" only when its comanda is `payableByLines` —
//     its lines owe exactly what the comanda owes, so the server's per-comanda cap can
//     never refuse the selection. An adjusted comanda that still owes something is
//     charged by amount (Cobrar todo / Por personas / Importe libre) instead.
//
// A response without `settlement` (an older backend) keeps the previous line-derived
// behaviour exactly, so the frontend can ship before or after the backend.

const cents = (value) => Math.round((Number(value) || 0) * 100);

export function commandSettlement(command) {
  const s = command && command.settlement;
  if (!s || typeof s !== "object") return null;
  if (!Number.isFinite(Number(s.outstanding)) || typeof s.payState !== "string") return null;
  return s;
}

function settlementByOrderId(session) {
  const map = new Map();
  for (const command of session?.commands || []) {
    const s = commandSettlement(command);
    if (s) map.set(String(command.id), s);
  }
  return map;
}

// Lines annotated with `pending` / `selectable`, raw fields untouched. Without a
// settlement for the line's comanda both flags are the historical `remaining > 0`.
export function settlementLines(session, lines = session?.lines) {
  const byOrder = settlementByOrderId(session);
  return (Array.isArray(lines) ? lines : []).map((line) => {
    const owedByLine = Number(line?.remaining) > 0;
    const s = byOrder.get(String(line?.orderId));
    if (!s) return { ...line, pending: owedByLine, selectable: owedByLine };
    const commandOwes = Number(s.outstanding) > 0;
    return { ...line, pending: owedByLine && commandOwes, selectable: owedByLine && commandOwes && s.payableByLines === true };
  });
}

// "Pagada" for a comanda: the backend payState when present, otherwise the
// historical rule (every one of its lines fully paid). A comanda that owes nothing at
// all (cancelled, or adjusted to 0) is never labelled "Pagada": it keeps its own state
// label, and any money it kept is the table's over-collection, shown at table level.
export function isCommandPaid(command, commandLines) {
  const s = commandSettlement(command);
  if (s) return s.payState === "paid" && Number(s.currentObligation) > 0;
  const lines = Array.isArray(commandLines) ? commandLines : [];
  return lines.length > 0 && lines.every((line) => !(Number(line?.remaining) > 0));
}

// The CUENTA CLIENTE "still to pay" rows. A comanda payable by lines lists its pending
// lines exactly as before; an adjusted comanda that still owes something is ONE row at
// its canonical outstanding; a settled comanda lists nothing.
export function billPendingRows(session) {
  const byOrder = settlementByOrderId(session);
  const rows = [];
  const summarised = new Set();
  for (const line of session?.lines || []) {
    const s = byOrder.get(String(line?.orderId));
    if (!s) {
      if (Number(line?.remaining) > 0) rows.push({ label: line.description, value: Number(line.remaining) });
      continue;
    }
    if (!(Number(s.outstanding) > 0)) continue;
    if (s.payableByLines === true) {
      if (Number(line?.remaining) > 0) rows.push({ label: line.description, value: Number(line.remaining) });
      continue;
    }
    const key = String(line.orderId);
    if (summarised.has(key)) continue;
    summarised.add(key);
    const command = (session?.commands || []).find((c) => String(c.id) === key);
    rows.push({ label: `Comanda ${command?.commandNumber ?? key}`, value: Number(s.outstanding) });
  }
  return rows;
}

// Whether a Por productos selection can be sent as is. The server charges the selected
// lines' own remaining and refuses more than the table still owes; saying so before the
// request is the only thing checked here.
export function selectionFitsOutstanding(selectionAmount, outstanding) {
  return cents(selectionAmount) <= cents(outstanding);
}

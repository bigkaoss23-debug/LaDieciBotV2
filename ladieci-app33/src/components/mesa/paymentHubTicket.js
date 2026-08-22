// paymentHubTicket — the "Resumen del ticket" projection for Payment Hub V1.
//
// The Mesa backend models a bill as ONE LINE PER UNIT: two beers are two rows
// of 3,00 €, not one row of "2 × 3,00". The approved Payment Hub mockup shows
// "2  Estrella Galicia   6,00 €", so the quantity column is produced HERE, by
// grouping identical descriptions for display.
//
// THIS IS A DISPLAY PROJECTION AND NOTHING ELSE. It never feeds a payment: the
// hub charges through the existing mesaApi.pay modes, which address lines by
// their own `id`, so grouping cannot merge, split or re-price anything the
// backend will act on. The authoritative money — Total, Ya cobrado, Resta por
// pagar — is read from session.total / session.paid / session.outstanding and
// is never re-derived from these rows; if a line arrived without an amount the
// summed column would drift from the real total, and the real total is the one
// the operator is shown.
//
// Order is first-appearance, so the ticket reads in the sequence the kitchen
// received it rather than alphabetically.

export function groupTicketLines(lines) {
  const order = [];
  const byKey = new Map();
  for (const line of Array.isArray(lines) ? lines : []) {
    const description = String(line?.description ?? "").trim() || "—";
    // Case-insensitive so "Fanta naranja" and "Fanta Naranja" are one product;
    // the first spelling seen is the one displayed.
    const key = description.toLowerCase();
    const amount = Number(line?.amount);
    // A line the backend sent without an amount is still a real product. It
    // contributes 0 to this column rather than disappearing from the ticket —
    // an item the guest can see on the table must be visible on the bill.
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    // One row = one unit, unless the backend ever starts sending its own
    // quantity, in which case that wins over counting rows.
    const declared = Number(line?.quantity);
    const quantity = Number.isFinite(declared) && declared > 0 ? declared : 1;
    if (!byKey.has(key)) {
      byKey.set(key, { key, description, quantity: 0, amount: 0 });
      order.push(key);
    }
    const row = byKey.get(key);
    row.quantity += quantity;
    // Rounded at every step: summing floats across a long ticket otherwise
    // shows 6,000000000000001 € on a bill a guest is reading.
    row.amount = Math.round((row.amount + safeAmount) * 100) / 100;
  }
  return order.map((key) => byKey.get(key));
}

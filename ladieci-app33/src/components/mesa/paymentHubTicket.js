// paymentHubTicket — the "Resumen del ticket" projection for the Payment Hub.
//
// TWO JOBS, BOTH DISPLAY-ONLY.
//
// 1. QUANTITY. The Mesa backend models a bill as ONE LINE PER UNIT: two beers
//    are two rows of 3,00 €, not one row of "2 × 3,00". The approved mockup
//    shows "2  Estrella Galicia   6,00 €", so the quantity column is produced
//    here, by grouping units that display identically.
//
// 2. IDENTITY. A line's `description` is only the fantasy name — "El Mago de
//    Zadar" — and an operator should not have to memorise nicknames to read a
//    bill. Every line already carries `product` (the backend's
//    product_snapshot), which holds officialNumber / classicName /
//    fantasyName, so the ticket can say "#9 · Vegetariana" with "El Mago de
//    Zadar" beneath it. Nothing is invented: when a field is absent the label
//    degrades to what is actually there.
//
// IT IS NOT A SOURCE OF MONEY. The authoritative figures — Total, Ya cobrado,
// Resta por pagar — are read from session.total / session.paid /
// session.outstanding and never re-derived from these rows. What a selection
// actually charges is decided by the SERVER from the real line ids
// (mesa_post_payment_v1 sums the selected lines' own remaining), so grouping
// cannot merge, split or re-price anything: `lineIds` below carries the real
// ids through untouched.

const clean = (value) => {
  const text = String(value ?? "").trim();
  return text ? text : null;
};

// The two-line label. Pizzas lead with the number and the real name, because
// that is what the menu and the kitchen call it; the nickname sits underneath
// as the thing the guest actually said. Drinks have no number and their
// "classicName" is usually the format ("0,33L", "33cl"), which reads correctly
// as the secondary line for exactly the same reason.
// A secondary line is only ever shown when it says something the primary does
// not — "Aquarius / Aquarius" is noise, not information.
//
// THE ONE SHARED AUTHORITY for product numbering + label, reused verbatim by
// Mesa Workspace (Comanda actual / Resumen), the item detail sheet and
// Payment Hub / Ver cuenta (all three call groupTicketLines(), which calls
// this) -- a fix here fixes all three at once, never three separate patches.
//
// "Nº" not "#": a Mesa comanda is also identified as "Comanda N" elsewhere in
// this same UI (see TabMesa.jsx's ComandaActualCard/ResumenComandasSection) --
// reusing "#" for a PRODUCT's catalogue number would make "#3" ambiguous
// between "product 3" and "comanda 3" wherever the two could appear near each
// other (e.g. the item detail sheet, which shows both). "Nº" only ever means
// a catalogue number.
//
// number is only ever a real catalogue identity: 0/null/undefined/negative/
// non-numeric all resolve to `null`, never a printed "Nº 0" -- a test SKU or
// an uncatalogued item has no number to show, not a fake one.
export function productLabel(line) {
  const product = (line && typeof line.product === "object" && line.product) || {};
  const description = clean(line && line.description);
  const fantasy = clean(product.fantasyName) || clean(product.n);
  const classic = clean(product.classicName);
  const rawNumber = product.officialNumber != null ? product.officialNumber : product.num;
  const parsedNumber = Number(rawNumber);
  const number = Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : null;

  let primary;
  let secondary;
  if (number != null) {
    primary = `Nº ${number} · ${classic || fantasy || description || "—"}`;
    secondary = fantasy || null;
  } else {
    primary = fantasy || description || "—";
    secondary = classic || null;
  }
  // Never repeat the primary underneath itself.
  if (secondary && primary.toLowerCase().includes(secondary.toLowerCase())) secondary = null;
  return { primary, secondary, number, classic, fantasy, description };
}

export function groupTicketLines(lines) {
  const order = [];
  const byKey = new Map();
  for (const line of Array.isArray(lines) ? lines : []) {
    const label = productLabel(line);
    // Grouped by what is DISPLAYED, so "Coca Cola · 0,33L" and
    // "Coca Cola · 1L" stay two rows even though they share a description.
    const key = `${label.primary}||${label.secondary || ""}`.toLowerCase();
    const amount = Number(line?.amount);
    const remaining = Number(line?.remaining);
    // A line the backend sent without an amount is still a real product: it
    // contributes 0 rather than vanishing from a bill the guest can see.
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    const safeRemaining = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
    const declared = Number(line?.quantity);
    const quantity = Number.isFinite(declared) && declared > 0 ? declared : 1;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key, label, description: label.primary,
        quantity: 0, amount: 0, remaining: 0,
        lineIds: [], selectableLineIds: [],
      });
      order.push(key);
    }
    const row = byKey.get(key);
    row.quantity += quantity;
    // Rounded at every step: a bill a guest reads must not show
    // 6,000000000000001 €.
    row.amount = Math.round((row.amount + safeAmount) * 100) / 100;
    row.remaining = Math.round((row.remaining + safeRemaining) * 100) / 100;
    const id = line && line.id != null ? String(line.id) : null;
    if (id) {
      row.lineIds.push(id);
      // Only units with something still owed may be charged again. This is
      // the list that reaches mesa_post_payment_v1.
      if (safeRemaining > 0) row.selectableLineIds.push(id);
    }
  }
  return order.map((key) => {
    const row = byKey.get(key);
    return { ...row, paidInFull: row.selectableLineIds.length === 0 };
  });
}

// What a selection of grouped rows is worth, and which real line ids it maps
// to. The amount here is only what the operator is SHOWN — the server
// recomputes it from these same ids before charging anything.
export function selectionTotals(rows, selectedKeys) {
  const keys = selectedKeys instanceof Set ? selectedKeys : new Set(selectedKeys || []);
  let amount = 0;
  const lineIds = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!keys.has(row.key) || row.paidInFull) continue;
    amount = Math.round((amount + row.remaining) * 100) / 100;
    lineIds.push(...row.selectableLineIds);
  }
  return { amount, lineIds };
}

// Por personas. The denominator is the table's REAL remaining covers, and the
// shares come from the same equal-split arithmetic Mesa already uses, so N
// shares can never overshoot the outstanding balance the way N × ceil(share)
// would (10,00 € across 3 would suggest 10,02 €).
export function personShares(outstanding, remainingCovers) {
  const total = Math.round((Number(outstanding) || 0) * 100);
  const covers = Number(remainingCovers);
  if (!Number.isInteger(covers) || covers < 1 || total <= 0) return [];
  const shares = [];
  let left = total;
  for (let remaining = covers; remaining > 0; remaining -= 1) {
    const share = Math.ceil(left / remaining);
    shares.push(share);
    left -= share;
  }
  return shares.map((cents) => cents / 100);
}

export function amountForPersons(outstanding, remainingCovers, persons) {
  const shares = personShares(outstanding, remainingCovers);
  const n = Number(persons);
  if (!Number.isInteger(n) || n < 1 || n > shares.length) return 0;
  const cents = shares.slice(0, n).reduce((sum, share) => sum + Math.round(share * 100), 0);
  return cents / 100;
}

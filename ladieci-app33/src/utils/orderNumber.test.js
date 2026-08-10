import {
  formatOrderLabel, formatOrderNumber, getOrderNumber, normalizeOrderNumberToken,
  buildVisibleOrderLabels, resolveVisibleOrderLabel,
} from "./orderNumber";

describe("orderNumber", () => {
  test.each([
    ["723", "#723"], ["#723", "#723"], ["##723", "#723"], ["Pedido #723", "#723"],
    [{ id: "#723" }, "#723"], [{ service_order_number: 1, id: "#725" }, "#001"],
    [{ serviceOrderNumber: 20, id: "#900" }, "#020"], [{ numero_servicio: "3", id: "#901" }, "#003"],
  ])("formats %p with exactly one prefix", (input, expected) => {
    expect(formatOrderNumber(input)).toBe(expected);
  });

  test("operational number wins while raw technical id remains untouched", () => {
    const order = { id: "#725", service_order_number: 7 };
    expect(getOrderNumber(order)).toBe(7);
    expect(formatOrderLabel(order)).toBe("PEDIDO #007");
    expect(order.id).toBe("#725");
  });

  test("handles empty and legacy labels", () => {
    expect(normalizeOrderNumberToken(" Orden ##42 ")).toBe("42");
    expect(formatOrderNumber(null)).toBe("—");
    expect(formatOrderLabel(null)).toBe("PEDIDO —");
  });
});

// P1-A -- ticket-number disambiguation. This suite must FAIL against the
// pre-P1-A formatter (formatOrderNumber alone has no concept of "who else is
// currently visible", so it could never tell #001/service-A from #001/service-B
// apart) -- buildVisibleOrderLabels is the new surface under test.
describe("buildVisibleOrderLabels", () => {
  const o = (id, service_order_number, service_session_id) => ({ id, service_order_number, service_session_id });

  test("1. single-service numbers unchanged (no collision -> no suffix, ever)", () => {
    const orders = [o("A", 1, "svc-1"), o("B", 2, "svc-1"), o("C", 3, "svc-1")];
    const labels = buildVisibleOrderLabels(orders);
    expect(labels.get("A")).toBe("#001");
    expect(labels.get("B")).toBe("#002");
    expect(labels.get("C")).toBe("#003");
  });

  test("2. cross-service duplicate (same number, different service) gets disambiguated", () => {
    const orders = [o("A", 1, "svc-A"), o("B", 1, "svc-B")];
    const labels = buildVisibleOrderLabels(orders);
    expect(labels.get("A")).not.toBe(labels.get("B"));
    expect(labels.get("A")).toMatch(/^#001 · [A-Z]$/);
    expect(labels.get("B")).toMatch(/^#001 · [A-Z]$/);
  });

  test("3. different-day, same service_kind collision still gets disambiguated (kind alone is not the key -- session identity is)", () => {
    // Two lunch-service sessions on different days both reach #001; only session id differs.
    const orders = [o("A", 1, "lunch-2026-08-09"), o("B", 1, "lunch-2026-08-10")];
    const labels = buildVisibleOrderLabels(orders);
    expect(labels.get("A")).not.toBe(labels.get("B"));
  });

  test("4. same-table cross-service collision (e.g. a carried-over table) gets disambiguated", () => {
    // Same table_session_id (a carried-over Mesa table), but the two orders
    // were placed under different services and both landed on #001 -- the
    // shared table doesn't make them the same order, and must not suppress
    // disambiguation.
    const orders = [
      { ...o("A", 1, "svc-A"), table_session_id: "table-6" },
      { ...o("B", 1, "svc-B"), table_session_id: "table-6" },
    ];
    const labels = buildVisibleOrderLabels(orders);
    expect(labels.get("A")).not.toBe(labels.get("B"));
  });

  test("5. three-way collision: all three labels remain pairwise distinct", () => {
    const orders = [o("A", 1, "svc-A"), o("B", 1, "svc-B"), o("C", 1, "svc-C")];
    const labels = buildVisibleOrderLabels(orders);
    const values = new Set([labels.get("A"), labels.get("B"), labels.get("C")]);
    expect(values.size).toBe(3);
    for (const v of values) expect(v).toMatch(/^#001 · [A-Z]$/);
  });

  test("6. visible labels are deterministic for a given input (same array -> same output, repeatedly)", () => {
    const orders = [o("A", 1, "svc-B"), o("B", 1, "svc-A"), o("C", 5, "svc-A")];
    const first = buildVisibleOrderLabels(orders);
    const second = buildVisibleOrderLabels(orders.map((x) => ({ ...x })));
    expect(Object.fromEntries(first)).toEqual(Object.fromEntries(second));
    // svc-A sorts before svc-B lexicographically -> B (svc-A) gets the earlier letter
    expect(first.get("B")).toBe("#001 · A");
    expect(first.get("A")).toBe("#001 · B");
  });

  test("same order id repeated with a different session is still treated as a real collision (defensive: never assume identity from the number)", () => {
    const orders = [o("A", 1, "svc-1"), o("B", 1, undefined), o("C", 1, null)];
    const labels = buildVisibleOrderLabels(orders);
    // unknown session on B/C can't be proven equal to A or to each other -> all three disambiguated
    const values = new Set([labels.get("A"), labels.get("B"), labels.get("C")]);
    expect(values.size).toBe(3);
  });

  test("the unmatched/fallback label ('—') is never grouped or suffixed, even when several orders lack a number", () => {
    // No id either: formatOrderNumber's own candidate list falls back to id
    // when present (see the pre-existing suite above), so a truly numberless
    // order has neither -- this is what actually reaches the "—" fallback.
    const orders = [{}, {}, {}];
    const labels = buildVisibleOrderLabels(orders);
    expect([...labels.values()]).toEqual(["—", "—", "—"]);
  });

  test("empty/non-array input returns an empty map without throwing", () => {
    expect(buildVisibleOrderLabels([]).size).toBe(0);
    expect(buildVisibleOrderLabels(null).size).toBe(0);
    expect(buildVisibleOrderLabels(undefined).size).toBe(0);
  });
});

describe("resolveVisibleOrderLabel", () => {
  test("uses the precomputed label when present in the map", () => {
    const labels = new Map([["A", "#001 · A"]]);
    expect(resolveVisibleOrderLabel({ id: "A", service_order_number: 1 }, labels)).toBe("#001 · A");
  });

  test("falls back to plain formatOrderNumber when the order is not in the map (e.g. a race with a list update)", () => {
    const labels = new Map([["A", "#001 · A"]]);
    expect(resolveVisibleOrderLabel({ id: "Z", service_order_number: 9 }, labels)).toBe("#009");
  });

  test("falls back gracefully with no map at all", () => {
    expect(resolveVisibleOrderLabel({ id: "A", service_order_number: 1 }, null)).toBe("#001");
  });
});

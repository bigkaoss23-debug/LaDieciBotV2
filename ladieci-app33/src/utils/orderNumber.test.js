import { formatOrderLabel, formatOrderNumber, getOrderNumber, normalizeOrderNumberToken } from "./orderNumber";

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

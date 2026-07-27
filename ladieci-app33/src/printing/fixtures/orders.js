const base = {
  location_id: "fixture-location-001",
  service_session_id: "fixture-session-2026-01-15",
  order_revision: 1,
  snapshot_created_at: "2026-01-15T19:05:00.000Z",
  locale: "es-ES",
  location_name: "LA DIECI — ENTORNO DE PRUEBA",
  ordered_at: "2026-01-15T19:00:00.000Z",
  promised_at: "20:20",
  fulfilment_type: "RITIRO",
  privacy: { pii_classification: "synthetic_fixture", permitted_sections: [] },
  pricing: { subtotal: 9, discount: 0, delivery_fee: 0, total: 9 },
  payment: { method: "EFECTIVO", status: "PENDIENTE" },
  items: [{ quantity: 1, name: "Margarita de prueba", unit_price: 9, line_total: 9 }],
};

const fixture = (id, label, patch = {}) => Object.freeze({
  id,
  label,
  order: Object.freeze({
    ...base,
    ...patch,
    id: `fixture-order-${id}`,
    order_number: patch.order_number || String(100 + Number(id.replace(/\D/g, "") || 0)),
    items: patch.items || base.items,
    pricing: { ...base.pricing, ...(patch.pricing || {}) },
    payment: { ...base.payment, ...(patch.payment || {}) },
    privacy: { ...base.privacy, ...(patch.privacy || {}) },
    delivery: patch.delivery ? { ...patch.delivery } : undefined,
  }),
});

export const PRINT_ORDER_FIXTURES = Object.freeze([
  fixture("01", "Banco simple", { channel: "BANCO" }),
  fixture("02", "Teléfono", { channel: "TEL", table_number: "B2" }),
  fixture("03", "WhatsApp", { channel: "WA" }),
  fixture("04", "Delivery autorizado", {
    channel: "MANUAL", fulfilment_type: "DOMICILIO", zona: "Q-FICTICIA",
    direccion: "Calle de Prueba 42, 2º B", tel: "+34 600 000 000",
    direccion_note: "Timbre sin nombre, dirección completamente ficticia.",
    delivery: { zone: "Q-FICTICIA", customer_delivery_data: { address: "Calle de Prueba 42, 2º B", phone: "+34 600 000 000" } },
    privacy: { permitted_sections: ["customer_delivery_address"] },
    pricing: { subtotal: 9, delivery_fee: 2.5, total: 11.5 },
  }),
  fixture("05", "Muchas pizzas", {
    channel: "BANCO", items: Array.from({ length: 9 }, (_, index) => ({
      quantity: index % 3 + 1, name: `Pizza sintética número ${index + 1}`, unit_price: 8 + index, line_total: (8 + index) * (index % 3 + 1),
    })), pricing: { subtotal: 234, total: 234 },
  }),
  fixture("06", "Con extras", {
    channel: "TEL", items: [{ quantity: 2, name: "Diávola ficticia", extras: ["mozzarella extra", "champiñones"], unit_price: 12, line_total: 24 }],
    pricing: { subtotal: 24, total: 24 },
  }),
  fixture("07", "Sin ingredientes", {
    channel: "BANCO", items: [{ quantity: 1, name: "Caprichosa ficticia", removed_ingredients: ["aceitunas", "jamón"], unit_price: 11, line_total: 11 }],
    pricing: { subtotal: 11, total: 11 },
  }),
  fixture("08", "Nota cocina", { channel: "MANUAL", kitchen_notes: ["Cortar en ocho porciones y dejar muy hecha, nota exclusivamente sintética."] }),
  fixture("09", "Alérgenos", {
    channel: "TEL", allergy_markers: ["FRUTOS SECOS"],
    items: [{ quantity: 1, name: "Pizza de laboratorio", allergy_markers: ["GLUTEN", "LACTOSA"], unit_price: 10, line_total: 10 }],
    pricing: { subtotal: 10, total: 10 },
  }),
  fixture("10", "Mesa", { channel: "BANCO", table_number: "T-12" }),
  fixture("11", "Cliente pagado", { channel: "BANCO", payment: { method: "TARJETA", status: "PAGADO" } }),
  fixture("12", "Cliente pendiente", { channel: "WA", payment: { method: null, status: "PENDIENTE" } }),
  fixture("13", "Delta cocina", {
    channel: "TEL", order_revision: 3, base_revision: 2, changes: ["Añadida una pizza"],
    items: [{ quantity: 1, name: "Nueva pizza del delta", extras: ["cebolla"], unit_price: 10, line_total: 10 }],
  }),
  fixture("14", "Corrección", {
    channel: "WA", order_revision: 4, base_revision: 3, changes: ["Quitar aceitunas de la línea 1"],
    items: [{ quantity: 1, name: "Pizza corregida", removed_ingredients: ["aceitunas"], unit_price: 10, line_total: 10 }],
  }),
  fixture("15", "Anulación", { channel: "MANUAL", order_revision: 2, changes: ["Anular el pedido completo"] }),
  fixture("16", "Wrapping y acentos", {
    channel: "TEL",
    items: [{
      quantity: 12,
      name: "Pizza extraordinariamente larga con piña, jalapeño y champiñón para comprobar el ajuste de línea",
      extras: ["mozzarella extra muy abundante", "pimiento ñora caramelizado", "rúcula después del horno"],
      removed_ingredients: ["cebolla morada cortada muy fina"],
      notes: ["Preparar con muchísimo cuidado porque esta nota larga debe continuar en varias líneas sin reducir el tamaño del texto."],
      unit_price: 13.5,
      line_total: 162,
    }],
    pricing: { subtotal: 162, discount: 12, total: 150 },
    final_message: "Gracias por elegir nuestro entorno de demostración. ¡Hasta la próxima!",
  }),
]);

export function getPrintFixture(id) {
  const found = PRINT_ORDER_FIXTURES.find((entry) => entry.id === id);
  if (!found) throw new TypeError(`Unknown print fixture: ${String(id)}`);
  return found;
}

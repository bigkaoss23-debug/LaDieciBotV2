import { TICKET_TYPES, assertTicketSnapshot } from "./contracts";
import { getLayoutProfile } from "./layoutProfiles";
import { createTicketDocument, cutBlock, feedBlock, separatorBlock, textBlock } from "./ticketDocument";
import { formatServiceOrderNumber } from "./orderNumber";

const LABELS = {
  [TICKET_TYPES.KITCHEN_DELTA]: "SOLO ARTÍCULOS NUEVOS",
  [TICKET_TYPES.KITCHEN_CORRECTION]: "CORRECCIÓN",
  [TICKET_TYPES.CANCELLATION]: "ANULACIÓN",
};

const time = (value) => {
  if (!value) return "—";
  const text = String(value);
  const match = text.match(/(?:T|\s)(\d{2}:\d{2})/) || text.match(/^(\d{1,2}:\d{2})$/);
  return match ? match[1] : text;
};

export function renderKitchenTicket(snapshot) {
  assertTicketSnapshot(snapshot);
  if (snapshot.ticket_type === TICKET_TYPES.CUSTOMER) throw new TypeError("Customer snapshot cannot be rendered as a kitchen ticket");
  const profile = getLayoutProfile(snapshot.paper_width);
  const blocks = [];
  const marker = LABELS[snapshot.ticket_type];
  if (marker) blocks.push(textBlock(marker, { align: "center", emphasis: "bold", size: "large" }));
  if (snapshot.print.is_reprint) blocks.push(textBlock(`REIMPRESIÓN · COPIA ${snapshot.print.copy_number}`, { align: "center", emphasis: "bold" }));
  blocks.push(
    textBlock(formatServiceOrderNumber(snapshot.order.order_number), { align: "center", emphasis: "bold", size: profile.orderNumberSize }),
    textBlock(`${snapshot.order.channel} · ${snapshot.order.fulfilment_type}`, { align: "center", emphasis: "bold" }),
    textBlock(`Pedido ${time(snapshot.order.ordered_at)} · Prometido ${time(snapshot.order.promised_at)}`),
  );
  if (snapshot.order.table_number) blocks.push(textBlock(`MESA ${snapshot.order.table_number}`, { emphasis: "bold" }));
  blocks.push(textBlock(`REVISIÓN ${snapshot.order_revision}`, { emphasis: "bold" }), separatorBlock(profile.separator));
  snapshot.kitchen.items.forEach((item) => {
    blocks.push(textBlock(`${item.quantity} × ${item.name}`, { emphasis: "bold", size: "large" }));
    item.extras.forEach((extra) => blocks.push(textBlock(`  + ${extra}`)));
    item.removed_ingredients.forEach((removed) => blocks.push(textBlock(`  SIN ${removed}`, { emphasis: "bold" })));
    item.preparation_markers.forEach((value) => blocks.push(textBlock(`  PREPARACIÓN: ${value}`)));
    item.notes.forEach((note) => blocks.push(textBlock(`  NOTA: ${note}`)));
    item.allergy_markers.forEach((allergy) => blocks.push(textBlock(`!!! ALERGIA: ${allergy} !!!`, { emphasis: "bold", size: "large" })));
  });
  snapshot.kitchen.kitchen_notes.forEach((note) => blocks.push(textBlock(`NOTA COCINA: ${note}`, { emphasis: "bold" })));
  snapshot.kitchen.allergy_markers.forEach((allergy) => blocks.push(textBlock(`!!! ALERGIA PEDIDO: ${allergy} !!!`, { emphasis: "bold", size: "large" })));
  snapshot.kitchen.changes.forEach((change) => blocks.push(textBlock(`CAMBIO: ${change}`, { emphasis: "bold" })));
  blocks.push(separatorBlock(profile.separator), feedBlock(profile.finalFeedLines), cutBlock(profile.cutMode));
  return createTicketDocument(snapshot, blocks, { document_kind: "kitchen" });
}

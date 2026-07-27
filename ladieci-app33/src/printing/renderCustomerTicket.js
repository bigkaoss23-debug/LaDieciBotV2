import { TICKET_TYPES, assertTicketSnapshot } from "./contracts";
import { getLayoutProfile, wrapText } from "./layoutProfiles";
import { columnsBlock, createTicketDocument, cutBlock, feedBlock, separatorBlock, textBlock } from "./ticketDocument";

const euro = (value) => value == null ? "—" : `${Number(value).toFixed(2)} €`;

export function renderCustomerTicket(snapshot) {
  assertTicketSnapshot(snapshot);
  if (snapshot.ticket_type !== TICKET_TYPES.CUSTOMER) throw new TypeError("Only CUSTOMER snapshots can be rendered as customer tickets");
  const profile = getLayoutProfile(snapshot.paper_width);
  const pricing = snapshot.customer.pricing;
  const blocks = [
    textBlock(snapshot.customer.location_name, { align: "center", emphasis: "bold", size: "large" }),
    textBlock(`PEDIDO #${snapshot.order.order_number}`, { align: "center", emphasis: "bold", size: "large" }),
    textBlock(new Date(snapshot.order.ordered_at).toLocaleString(snapshot.locale, {
      timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    })),
    textBlock(`${snapshot.order.channel} · ${snapshot.order.fulfilment_type}`),
  ];
  if (snapshot.order.table_number) blocks.push(textBlock(`MESA ${snapshot.order.table_number}`));
  if (snapshot.print.is_reprint) blocks.push(textBlock(`REIMPRESIÓN · COPIA ${snapshot.print.copy_number}`, { align: "center", emphasis: "bold" }));
  blocks.push(separatorBlock(profile.separator));
  snapshot.customer.items.forEach((item) => {
    const productLines = wrapText(item.name, profile.productColumnWidth);
    blocks.push(columnsBlock([
      { value: `${item.quantity}×`, width: profile.quantityColumnWidth },
      { value: productLines[0] || item.name, width: profile.productColumnWidth },
      { value: euro(item.line_total), width: profile.moneyColumnWidth, align: "right" },
    ]));
    productLines.slice(1).forEach((line) => blocks.push(textBlock(`${" ".repeat(profile.quantityColumnWidth + 1)}${line}`)));
    if (item.unit_price != null) blocks.push(textBlock(`  Precio unitario: ${euro(item.unit_price)}`));
    item.extras.forEach((extra) => blocks.push(textBlock(`  + ${extra}`)));
    item.removed_ingredients.forEach((removed) => blocks.push(textBlock(`  Sin ${removed}`)));
  });
  blocks.push(separatorBlock(profile.separator));
  const totalLabelWidth = profile.charactersPerLine - profile.moneyColumnWidth - 1;
  if (pricing.subtotal != null) blocks.push(columnsBlock([{ value: "Subtotal", width: totalLabelWidth }, { value: euro(pricing.subtotal), width: profile.moneyColumnWidth, align: "right" }]));
  if (pricing.delivery_fee != null) blocks.push(columnsBlock([{ value: "Entrega", width: totalLabelWidth }, { value: euro(pricing.delivery_fee), width: profile.moneyColumnWidth, align: "right" }]));
  if (pricing.discount != null && pricing.discount > 0) blocks.push(columnsBlock([{ value: "Descuento", width: totalLabelWidth }, { value: `-${euro(pricing.discount)}`, width: profile.moneyColumnWidth, align: "right" }]));
  blocks.push(textBlock(`TOTAL ${euro(pricing.total)}`, { align: "right", emphasis: "bold", size: "large" }));
  blocks.push(textBlock(`Pago: ${snapshot.customer.payment.method || "—"}`));
  blocks.push(textBlock(`Estado: ${snapshot.customer.payment.status}`, { emphasis: "bold" }));
  const mayShowAddress = snapshot.privacy.permitted_sections.includes("customer_delivery_address");
  if (snapshot.order.fulfilment_type === "DOMICILIO" && mayShowAddress && snapshot.delivery.customer_delivery_data.address) {
    blocks.push(textBlock(`Dirección: ${snapshot.delivery.customer_delivery_data.address}`));
  }
  snapshot.delivery.delivery_notes.forEach((note) => blocks.push(textBlock(`Nota entrega: ${note}`)));
  blocks.push(separatorBlock(profile.separator), textBlock(snapshot.customer.final_message, { align: "center" }));
  blocks.push(feedBlock(profile.finalFeedLines), cutBlock(profile.cutMode));
  return createTicketDocument(snapshot, blocks, { document_kind: "customer" });
}

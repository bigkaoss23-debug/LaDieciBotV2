import { TICKET_TYPES, assertTicketSnapshot } from "./contracts";
import { CUSTOMER_TICKET_BUSINESS_PROFILE } from "./businessProfile";
import { getLayoutProfile, wrapText } from "./layoutProfiles";
import { columnsBlock, createTicketDocument, cutBlock, feedBlock, separatorBlock, textBlock } from "./ticketDocument";
import { formatServiceOrderNumber } from "./orderNumber";

const euro = (value, locale = "es-ES") => value == null ? "—" : new Intl.NumberFormat(locale, {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value)).replace(/\s(?=€$)/, "\u00a0");

export const businessHeaderLines = (profile = CUSTOMER_TICKET_BUSINESS_PROFILE) => [
  profile.address,
  profile.town,
  profile.phone,
].map((line) => String(line ?? "").trim()).filter(Boolean);

export function renderCustomerTicket(snapshot) {
  assertTicketSnapshot(snapshot);
  if (snapshot.ticket_type !== TICKET_TYPES.CUSTOMER) throw new TypeError("Only CUSTOMER snapshots can be rendered as customer tickets");
  const profile = getLayoutProfile(snapshot.paper_width);
  const pricing = snapshot.customer.pricing;
  const blocks = [
    textBlock(snapshot.customer.location_name, { align: "center", emphasis: "bold", size: "large" }),
  ];
  businessHeaderLines().forEach((line) => blocks.push(textBlock(line, { align: "center", role: "secondary" })));
  blocks.push(
    textBlock(CUSTOMER_TICKET_BUSINESS_PROFILE.document_label, { align: "center", emphasis: "bold" }),
    separatorBlock(profile.separator),
    textBlock(`PEDIDO ${formatServiceOrderNumber(snapshot.order.order_number, "—", 3)}`, { align: "center", emphasis: "bold", size: "xlarge" }),
    textBlock(new Date(snapshot.order.ordered_at).toLocaleString(snapshot.locale, {
      timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }), { role: "secondary" }),
    textBlock(snapshot.order.fulfilment_type, { align: "center", emphasis: "bold" }),
    textBlock(`Canal: ${snapshot.order.channel}`, { align: "center", role: "secondary" }),
  );
  if (snapshot.order.table_number) blocks.push(textBlock(`MESA ${snapshot.order.table_number}`));
  if (snapshot.print.is_reprint) blocks.push(textBlock(`REIMPRESIÓN · COPIA ${snapshot.print.copy_number}`, { align: "center", emphasis: "bold" }));
  if (snapshot.customer.display_name) blocks.push(textBlock(`Cliente: ${snapshot.customer.display_name}`));
  if (snapshot.customer.masked_phone) blocks.push(textBlock(`Tel: ${snapshot.customer.masked_phone}`, { role: "secondary" }));
  blocks.push(separatorBlock(profile.separator));
  snapshot.customer.items.forEach((item) => {
    const productLines = wrapText(item.primary_name || item.name, profile.productColumnWidth);
    blocks.push(columnsBlock([
      { value: `${item.quantity}×`, width: profile.quantityColumnWidth },
      { value: productLines[0] || item.primary_name || item.name, width: profile.productColumnWidth, emphasis: "bold" },
      { value: euro(item.line_total, snapshot.locale), width: profile.moneyColumnWidth, align: "right", role: "money" },
    ]));
    productLines.slice(1).forEach((line) => blocks.push(textBlock(`${" ".repeat(profile.quantityColumnWidth + 1)}${line}`)));
    if (item.secondary_name) blocks.push(textBlock(item.secondary_name, { role: "secondary" }));
    if (item.quantity > 1 && item.unit_price != null) {
      blocks.push(textBlock(`Precio unitario: ${euro(item.unit_price, snapshot.locale)}`, { role: "detail" }));
    }
    item.extras.forEach((extra) => blocks.push(textBlock(`+ ${extra}`, { role: "detail" })));
    item.removed_ingredients.forEach((removed) => blocks.push(textBlock(`SIN ${removed}`, { role: "detail" })));
    item.notes.forEach((note) => blocks.push(textBlock(`Nota: ${note}`, { role: "detail" })));
  });
  blocks.push(separatorBlock(profile.separator));
  const totalLabelWidth = profile.charactersPerLine - profile.moneyColumnWidth - 1;
  if (pricing.subtotal != null) blocks.push(columnsBlock([{ value: "Subtotal", width: totalLabelWidth }, { value: euro(pricing.subtotal, snapshot.locale), width: profile.moneyColumnWidth, align: "right", role: "money" }]));
  if (pricing.delivery_fee != null && pricing.delivery_fee > 0) blocks.push(columnsBlock([{ value: "Entrega", width: totalLabelWidth }, { value: euro(pricing.delivery_fee, snapshot.locale), width: profile.moneyColumnWidth, align: "right", role: "money" }]));
  if (pricing.discount != null && pricing.discount > 0) blocks.push(columnsBlock([{ value: "Descuento", width: totalLabelWidth }, { value: `-${euro(pricing.discount, snapshot.locale)}`, width: profile.moneyColumnWidth, align: "right", role: "money" }]));
  blocks.push(textBlock(`TOTAL ${euro(pricing.total, snapshot.locale)}`, { align: "right", emphasis: "bold", size: "large", role: "money" }));
  blocks.push(textBlock(`Pago: ${snapshot.customer.payment.method || "—"}`));
  blocks.push(textBlock(`Estado: ${snapshot.customer.payment.status}`, { emphasis: "bold" }));
  blocks.push(
    separatorBlock(profile.separator),
    textBlock(snapshot.customer.final_message, { align: "center", role: "secondary" }),
    textBlock(CUSTOMER_TICKET_BUSINESS_PROFILE.non_fiscal_label, { align: "center", role: "footer-small" }),
  );
  blocks.push(feedBlock(profile.finalFeedLines), cutBlock(profile.cutMode));
  return createTicketDocument(snapshot, blocks, { document_kind: "customer" });
}

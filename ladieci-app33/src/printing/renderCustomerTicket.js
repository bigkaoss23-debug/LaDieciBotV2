import { TICKET_TYPES, assertTicketSnapshot } from "./contracts";
import { CUSTOMER_TICKET_BUSINESS_PROFILE } from "./businessProfile";
import { getLayoutProfile, wrapText } from "./layoutProfiles";
import { columnsBlock, createTicketDocument, cutBlock, feedBlock, imageBlock, separatorBlock, textBlock } from "./ticketDocument";
import { formatServiceOrderNumber } from "./orderNumber";

const euro = (value, locale = "es-ES") => value == null ? "—" : new Intl.NumberFormat(locale, {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value)).replace(/\s(?=€$)/, "\u00a0");

export const businessHeaderLines = (profile = CUSTOMER_TICKET_BUSINESS_PROFILE) => [
  profile.business_type,
  profile.address,
  profile.town,
  profile.phone ? `Tel. ${String(profile.phone).trim()}` : null,
].map((line) => String(line ?? "").trim()).filter(Boolean);

export const shouldShowCustomerSubtotal = (pricing) => (
  pricing.subtotal != null
  && (
    Number(pricing.discount) > 0
    || Number(pricing.delivery_fee) > 0
    || Number(pricing.subtotal) !== Number(pricing.total)
  )
);

export const customerPaymentLine = (payment = {}) => {
  if (String(payment.status || "").toUpperCase() !== "PAGADO") return "PAGO: PENDIENTE";
  const method = String(payment.method || "").trim().toUpperCase();
  return ["EFECTIVO", "TARJETA", "BIZUM"].includes(method) ? `PAGADO · ${method}` : "PAGADO";
};

const isActualTableOrder = (order) => Boolean(order.table_number) && order.channel === "BANCO";

// Identification header (PEDIDO + full name right under the business header) exists
// to avoid swapping two bags. It applies to every DOMICILIO and to every RITIRO that
// is not a counter pickup. MESA orders and BANCO counter pickups keep the legacy
// layout (PEDIDO at the bottom, masked "Cliente:" line).
export const usesCustomerIdentityHeader = (order) => (
  !isActualTableOrder(order) && !(order.channel === "BANCO" && order.fulfilment_type === "RITIRO")
);

export const EMPTY_CUSTOMER_NAME_LABEL = "CLIENTE SIN NOMBRE";
// Longest name that still fits a single xlarge line (Courier New 0.6em advance,
// 1.55em xlarge, printable content width 43 mm on 58 mm paper / 74 mm on 80 mm).
const NAME_XLARGE_MAX_CHARS = Object.freeze({ 58: 19, 80: 30 });

export const customerIdentityName = (fullName) => (
  fullName ? String(fullName).toLocaleUpperCase("es-ES") : EMPTY_CUSTOMER_NAME_LABEL
);

export const customerIdentityNameSize = (name, paperWidth) => (
  Array.from(name).length <= NAME_XLARGE_MAX_CHARS[paperWidth] ? "xlarge" : "large"
);

export function renderCustomerTicket(snapshot) {
  assertTicketSnapshot(snapshot);
  if (snapshot.ticket_type !== TICKET_TYPES.CUSTOMER) throw new TypeError("Only CUSTOMER snapshots can be rendered as customer tickets");
  const profile = getLayoutProfile(snapshot.paper_width);
  const pricing = snapshot.customer.pricing;
  const identityHeader = usesCustomerIdentityHeader(snapshot.order);
  const orderNumberBlock = textBlock(`PEDIDO ${formatServiceOrderNumber(snapshot.order.order_number, "—", 3)}`, { align: "center", emphasis: "bold", size: "xlarge" });
  const blocks = [
    imageBlock("/printing/la-dieci-thermal-logo.png", { alt: "La Dieci", role: "business-logo" }),
  ];
  businessHeaderLines().forEach((line) => blocks.push(textBlock(line, { align: "center", role: "secondary" })));
  blocks.push(separatorBlock(profile.separator));
  if (identityHeader) {
    const name = customerIdentityName(snapshot.customer.full_name);
    blocks.push(
      orderNumberBlock,
      textBlock(name, { align: "center", emphasis: "bold", size: customerIdentityNameSize(name, snapshot.paper_width) }),
      separatorBlock(profile.separator),
    );
  }
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
  if (shouldShowCustomerSubtotal(pricing)) blocks.push(columnsBlock([{ value: "Subtotal", width: totalLabelWidth }, { value: euro(pricing.subtotal, snapshot.locale), width: profile.moneyColumnWidth, align: "right", role: "money" }]));
  if (pricing.delivery_fee != null && pricing.delivery_fee > 0) blocks.push(columnsBlock([{ value: "Entrega", width: totalLabelWidth }, { value: euro(pricing.delivery_fee, snapshot.locale), width: profile.moneyColumnWidth, align: "right", role: "money" }]));
  if (pricing.discount != null && pricing.discount > 0) blocks.push(columnsBlock([{ value: "Descuento", width: totalLabelWidth }, { value: `-${euro(pricing.discount, snapshot.locale)}`, width: profile.moneyColumnWidth, align: "right", role: "money" }]));
  blocks.push(textBlock(`TOTAL ${euro(pricing.total, snapshot.locale)}`, { align: "right", emphasis: "bold", size: "large", role: "money" }));
  blocks.push(textBlock(customerPaymentLine(snapshot.customer.payment), { emphasis: "bold" }));
  blocks.push(
    separatorBlock(profile.separator),
    textBlock(`${isActualTableOrder(snapshot.order) ? `MESA ${snapshot.order.table_number}` : snapshot.order.fulfilment_type}${snapshot.order.promised_at ? ` · ${snapshot.order.promised_at}` : ""}`, { align: "center", emphasis: "bold" }),
    ...(identityHeader ? [] : [orderNumberBlock]),
    textBlock(new Date(snapshot.order.ordered_at).toLocaleString(snapshot.locale, {
      timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }), { align: "center", role: "secondary" }),
  );
  if (snapshot.print.is_reprint) blocks.push(textBlock(`REIMPRESIÓN · COPIA ${snapshot.print.copy_number}`, { align: "center", emphasis: "bold" }));
  if (!identityHeader && snapshot.customer.display_name) blocks.push(textBlock(`Cliente: ${snapshot.customer.display_name}`));
  if (snapshot.customer.masked_phone) blocks.push(textBlock(`Tel: ${snapshot.customer.masked_phone}`, { role: "secondary" }));
  blocks.push(
    separatorBlock(profile.separator),
    textBlock("Gracias por tu pedido", { align: "center", role: "secondary" }),
    textBlock("¡Hasta pronto!", { align: "center", role: "secondary" }),
    textBlock(CUSTOMER_TICKET_BUSINESS_PROFILE.non_fiscal_label, { align: "center", role: "footer-small" }),
  );
  blocks.push(feedBlock(profile.finalFeedLines), cutBlock(profile.cutMode));
  return createTicketDocument(snapshot, blocks, { document_kind: "customer" });
}

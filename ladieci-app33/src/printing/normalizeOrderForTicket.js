import {
  TICKET_SNAPSHOT_VERSION,
  TICKET_TYPES,
  assertPaperWidth,
  assertTicketSnapshot,
  assertTicketType,
  deepFreeze,
} from "./contracts";
import { getItemExtraDisplays, getItemRemovedDisplays, resolveItemNote } from "../menu/itemDisplay";
import { CUSTOMER_TICKET_BUSINESS_PROFILE } from "./businessProfile";
import { resolveServiceOrderNumber } from "./orderNumber";

const nonEmpty = (value, field, required = true) => {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (required && !normalized) throw new TypeError(`${field} is required`);
  return normalized || null;
};

const optionalText = (value) => nonEmpty(value, "text", false);

const positiveInteger = (value, field) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new TypeError(`${field} must be a positive integer`);
  }
  return number;
};

const money = (value, field) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${field} must be a non-negative number`);
  return Math.round(number * 100) / 100;
};

const list = (value) => {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]).map(optionalText).filter(Boolean);
};

const parseItems = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : value;
  } catch (_) {
    return value;
  }
};

const normalizeDate = (value, field) => {
  const raw = nonEmpty(value, field);
  const numeric = Number(raw);
  const date = Number.isFinite(numeric) && numeric > 0
    ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${field} must be a valid date`);
  return date.toISOString();
};

const normalizeChannel = (value) => {
  const channel = nonEmpty(value, "order.channel").toUpperCase();
  const aliases = { WHATSAPP: "WA", PHONE: "TEL", TELEFONO: "TEL", BARRA: "BANCO" };
  const normalized = aliases[channel] || channel;
  if (!["WA", "TEL", "BANCO", "MANUAL"].includes(normalized)) {
    throw new TypeError(`Unsupported order channel: ${channel}`);
  }
  return normalized;
};

const normalizeFulfilment = (value) => {
  const fulfilment = nonEmpty(value, "order.fulfilment_type").toUpperCase();
  const aliases = { DELIVERY: "DOMICILIO", PICKUP: "RITIRO", RECOGIDA: "RITIRO" };
  const normalized = aliases[fulfilment] || fulfilment;
  if (!["DOMICILIO", "RITIRO"].includes(normalized)) {
    throw new TypeError(`Unsupported fulfilment type: ${fulfilment}`);
  }
  return normalized;
};

function normalizeItem(item, index, includePrices) {
  if (!item || typeof item !== "object") throw new TypeError(`items[${index}] must be an object`);
  const quantity = positiveInteger(item.quantity ?? item.q ?? item.qty ?? 1, `items[${index}].quantity`);
  const unitPrice = includePrices ? money(item.unit_price ?? item.finalUnitPrice ?? item.price ?? item.precio ?? item.p, `items[${index}].unit_price`) : null;
  const explicitLineTotal = includePrices ? money(item.line_total ?? item.lineTotal, `items[${index}].line_total`) : null;
  const canonicalExtras = getItemExtraDisplays(item).map(({ name, quantity: extraQuantity }) =>
    extraQuantity > 1 ? `${name} ×${extraQuantity}` : name);
  const extras = canonicalExtras.length ? canonicalExtras : list(item.extras ?? item.extra);
  const canonicalRemovals = getItemRemovedDisplays(item);
  const note = resolveItemNote(item);
  const artisticName = optionalText(item.fantasyName ?? item.n ?? item.name);
  const classicName = optionalText(item.classicName ?? item.realName ?? item.productName ?? item.nombre);
  const primaryName = artisticName || classicName;
  const secondaryName = classicName && classicName.localeCompare(primaryName, undefined, { sensitivity: "base" }) !== 0
    ? classicName
    : null;
  return {
    quantity,
    name: nonEmpty(primaryName, `items[${index}].name`),
    primary_name: nonEmpty(primaryName, `items[${index}].primary_name`),
    secondary_name: secondaryName,
    extras,
    removed_ingredients: canonicalRemovals.length
      ? canonicalRemovals
      : list(item.removed_ingredients ?? item.removed ?? item.sin),
    notes: note ? [note] : list(item.note),
    allergy_markers: list(item.allergy_markers ?? item.allergies),
    preparation_markers: list(item.preparation_markers ?? item.preparation),
    unit_price: unitPrice,
    line_total: explicitLineTotal ?? (unitPrice == null ? null : Math.round(unitPrice * quantity * 100) / 100),
  };
}

export function normalizeOrderForTicket(rawOrder, options = {}) {
  if (!rawOrder || typeof rawOrder !== "object" || Array.isArray(rawOrder)) {
    throw new TypeError("rawOrder must be an object");
  }
  const ticketType = assertTicketType(options.ticketType ?? rawOrder.ticket_type ?? TICKET_TYPES.KITCHEN);
  const defaultPaperWidth = ticketType === TICKET_TYPES.CUSTOMER
    ? CUSTOMER_TICKET_BUSINESS_PROFILE.default_paper_width
    : 80;
  const paperWidth = assertPaperWidth(options.paperWidth ?? rawOrder.paper_width ?? defaultPaperWidth);
  const orderRevision = positiveInteger(options.orderRevision ?? rawOrder.order_revision, "order_revision");
  const createdAt = nonEmpty(options.createdAt ?? rawOrder.snapshot_created_at, "created_at");
  if (Number.isNaN(Date.parse(createdAt))) throw new TypeError("created_at must be an ISO date");

  const fulfilmentType = normalizeFulfilment(rawOrder.fulfilment_type ?? rawOrder.tipo_consegna);
  const rawItems = parseItems(rawOrder.items);
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new TypeError("order.items must not be empty");
  const isKitchenTicket = ticketType !== TICKET_TYPES.CUSTOMER;
  const customerItems = rawItems.map((item, index) => normalizeItem(item, index, true));
  const kitchenItems = customerItems.map(({ unit_price, line_total, ...item }) => item);
  const pricing = rawOrder.pricing || {};
  const payment = rawOrder.payment || {};
  const permittedSections = list(rawOrder.privacy?.permitted_sections);

  const snapshot = {
    snapshot_version: TICKET_SNAPSHOT_VERSION,
    location_id: nonEmpty(options.locationId ?? rawOrder.location_id, "location_id"),
    order_id: nonEmpty(rawOrder.id ?? rawOrder.order_id, "order_id"),
    service_session_id: nonEmpty(rawOrder.service_session_id, "service_session_id"),
    order_revision: orderRevision,
    ticket_type: ticketType,
    locale: options.locale || rawOrder.locale || "es-ES",
    paper_width: paperWidth,
    created_at: createdAt,
    print: {
      copy_number: positiveInteger(options.copyNumber ?? rawOrder.copy_number ?? 1, "copy_number"),
      is_reprint: Boolean(options.isReprint ?? rawOrder.is_reprint),
    },
    order: {
      order_number: nonEmpty(resolveServiceOrderNumber(rawOrder), "order.order_number"),
      channel: normalizeChannel(rawOrder.channel ?? rawOrder.canal),
      fulfilment_type: fulfilmentType,
      table_number: optionalText(rawOrder.table_number ?? rawOrder.table_number_snapshot),
      ordered_at: normalizeDate(rawOrder.ordered_at ?? rawOrder.ts, "order.ordered_at"),
      promised_at: optionalText(rawOrder.promised_at ?? rawOrder.hora),
    },
    kitchen: {
      items: kitchenItems,
      kitchen_notes: list(rawOrder.kitchen_notes ?? rawOrder.nota_cucina ?? rawOrder.nota),
      allergy_markers: list(rawOrder.allergy_markers),
      preparation_markers: list(rawOrder.preparation_markers),
      is_delta: ticketType === TICKET_TYPES.KITCHEN_DELTA,
      base_revision: rawOrder.base_revision == null ? null : positiveInteger(rawOrder.base_revision, "base_revision"),
      changes: list(rawOrder.changes),
    },
    customer: {
      location_name: nonEmpty(rawOrder.location_name ?? "LA DIECI", "customer.location_name"),
      display_name: optionalText(rawOrder.customer_display_name),
      masked_phone: optionalText(rawOrder.customer_masked_phone),
      items: isKitchenTicket ? [] : customerItems,
      pricing: {
        subtotal: isKitchenTicket ? null : money(pricing.subtotal, "pricing.subtotal"),
        discount: isKitchenTicket ? null : money(pricing.discount ?? rawOrder.descuento_importe, "pricing.discount"),
        delivery_fee: isKitchenTicket ? null : money(pricing.delivery_fee ?? rawOrder.delivery_fee, "pricing.delivery_fee"),
        total: isKitchenTicket ? null : money(pricing.total ?? rawOrder.totale, "pricing.total"),
      },
      payment: {
        method: isKitchenTicket ? null : optionalText(payment.method ?? rawOrder.metodo_pago),
        status: isKitchenTicket ? null : (optionalText(payment.status)?.toUpperCase()
          || (rawOrder.ya_pagado === true ? "PAGADO" : "PENDIENTE")),
      },
      final_message: optionalText(rawOrder.final_message) || "Gracias por elegir La Dieci",
    },
    delivery: {
      zone: optionalText(rawOrder.delivery?.zone ?? rawOrder.zona),
      promised_at: optionalText(rawOrder.delivery?.promised_at ?? rawOrder.promised_at ?? rawOrder.hora),
      delivery_notes: isKitchenTicket
        ? list(rawOrder.delivery?.delivery_notes ?? rawOrder.direccion_note)
        : [],
      customer_delivery_data: {
        address: isKitchenTicket ? null : optionalText(rawOrder.delivery?.customer_delivery_data?.address ?? rawOrder.direccion),
        phone: isKitchenTicket ? null : optionalText(rawOrder.delivery?.customer_delivery_data?.phone ?? rawOrder.tel),
      },
    },
    privacy: {
      pii_classification: optionalText(rawOrder.privacy?.pii_classification) || "synthetic_fixture",
      permitted_sections: permittedSections,
    },
  };

  assertTicketSnapshot(snapshot);
  return deepFreeze(snapshot);
}

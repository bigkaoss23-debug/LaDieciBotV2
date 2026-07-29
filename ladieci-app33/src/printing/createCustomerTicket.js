import { CUSTOMER_TICKET_BUSINESS_PROFILE } from "./businessProfile";
import { TICKET_TYPES } from "./contracts";
import { normalizeOrderForTicket } from "./normalizeOrderForTicket";
import { renderTicketDocument } from "./renderTicketDocument";
import { maskCustomerName, maskCustomerPhone } from "./privacy";

const requiredText = (value, field) => {
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError(`${field} is required`);
  return text;
};

export function createCustomerTicket(order, options = {}) {
  if (!order || typeof order !== "object" || Array.isArray(order)) {
    throw new TypeError("order must be an object");
  }
  const orderId = requiredText(order.id ?? order.order_id, "order.id");
  if (order._temp) throw new TypeError("A persisted order is required");

  const createdAt = requiredText(options.createdAt, "createdAt");
  const snapshot = normalizeOrderForTicket({
    ...order,
    location_name: CUSTOMER_TICKET_BUSINESS_PROFILE.business_name,
    final_message: CUSTOMER_TICKET_BUSINESS_PROFILE.footer_message,
    customer_display_name: maskCustomerName(order.nombre ?? order.customer_name),
    customer_masked_phone: maskCustomerPhone(order.tel ?? order.phone),
    // The normal customer copy never carries delivery PII, even if a caller
    // accidentally forwards a permissive privacy section from another flow.
    tel: null,
    direccion: null,
    direccion_note: null,
    delivery: order.delivery ? {
      ...order.delivery,
      delivery_notes: [],
      customer_delivery_data: { address: null, phone: null },
    } : undefined,
    privacy: {
      ...(order.privacy || {}),
      permitted_sections: [],
    },
    service_session_id: order.service_session_id || `legacy-order:${orderId}`,
  }, {
    ticketType: TICKET_TYPES.CUSTOMER,
    paperWidth: options.paperWidth ?? CUSTOMER_TICKET_BUSINESS_PROFILE.default_paper_width,
    locationId: order.location_id || "la-dieci",
    orderRevision: options.orderRevision ?? order.order_revision ?? 1,
    createdAt,
    copyNumber: options.copyNumber ?? 1,
    isReprint: options.isReprint ?? false,
  });

  return Object.freeze({
    snapshot,
    document: renderTicketDocument(snapshot),
  });
}

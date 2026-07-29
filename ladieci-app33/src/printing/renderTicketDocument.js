import { TICKET_TYPES, assertTicketSnapshot } from "./contracts";
import { renderCustomerTicket } from "./renderCustomerTicket";
import { renderKitchenTicket } from "./renderKitchenTicket";

export function renderTicketDocument(snapshot) {
  assertTicketSnapshot(snapshot);
  return snapshot.ticket_type === TICKET_TYPES.CUSTOMER
    ? renderCustomerTicket(snapshot)
    : renderKitchenTicket(snapshot);
}

export { ticketDocumentToPlainText } from "./ticketDocument";

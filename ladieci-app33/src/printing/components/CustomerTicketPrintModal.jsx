import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createBrowserPrintAdapter, BROWSER_PRINT_OUTCOMES } from "../adapters/browserPrintAdapter";
import { CUSTOMER_TICKET_BUSINESS_PROFILE } from "../businessProfile";
import { createCustomerTicket } from "../createCustomerTicket";
import TicketDocumentView from "./TicketDocumentView";
import "./CustomerTicketPrintModal.css";

const STATUS_COPY = Object.freeze({
  preparing: "Preparando ticket",
  ready: "Vista previa lista",
  opening: "Abriendo diálogo de impresión",
  dialog_opened: "Diálogo de impresión abierto",
  user_outcome_unknown: "Resultado no verificable",
  failed: "Error al preparar el ticket",
});

export default function CustomerTicketPrintModal({ order, onClose }) {
  const paperWidth = CUSTOMER_TICKET_BUSINESS_PROFILE.default_paper_width;
  const [status, setStatus] = useState("preparing");
  const [error, setError] = useState("");
  const [createdAt] = useState(() => new Date().toISOString());
  const clickLock = useRef(false);
  const adapter = useMemo(() => createBrowserPrintAdapter(), []);

  const prepared = useMemo(() => {
    try {
      const result = createCustomerTicket(order, { paperWidth, createdAt });
      return { ...result, error: null };
    } catch (caught) {
      return { error: caught };
    }
  }, [createdAt, order, paperWidth]);

  useEffect(() => {
    document.body.classList.add("customer-ticket-print-open");
    return () => document.body.classList.remove("customer-ticket-print-open");
  }, []);

  useEffect(() => {
    if (prepared.error) {
      setStatus("failed");
      setError(prepared.error.message || "No se pudo preparar el ticket.");
    } else {
      setStatus("ready");
      setError("");
    }
  }, [prepared]);

  const handlePrint = async () => {
    if (clickLock.current || prepared.error) return;
    clickLock.current = true;
    setStatus("opening");
    const result = await adapter.print({
      onStatus: (next) => setStatus(next),
    });
    if (result.status === BROWSER_PRINT_OUTCOMES.FAILED) {
      setError("No se pudo abrir el diálogo de impresión.");
    }
    clickLock.current = false;
  };

  const busy = status === "opening" || status === "dialog_opened";

  return createPortal((
    <div className="customer-ticket-modal" role="dialog" aria-modal="true"
      aria-label="Vista previa del ticket" onClick={(event) => event.stopPropagation()}>
      <button className="customer-ticket-backdrop" type="button" aria-label="Cerrar" onClick={busy ? undefined : onClose} />
      <section className="customer-ticket-panel">
        <header className="customer-ticket-header">
          <div>
            <h2>Imprimir ticket</h2>
            <p>Copia informativa del pedido</p>
          </div>
          <button type="button" className="customer-ticket-close" onClick={onClose} disabled={busy}>×</button>
        </header>

        <div className="customer-ticket-toolbar">
          <strong>Papel: 58 mm fijo</strong>
          <output className={`customer-ticket-status is-${status}`} aria-live="polite">
            {STATUS_COPY[status]}
          </output>
        </div>

        {error ? (
          <div className="customer-ticket-error" role="alert">{error}</div>
        ) : (
          <TicketDocumentView document={prepared.document} className="customer-ticket-print-sheet" />
        )}

        <footer className="customer-ticket-actions">
          <button type="button" className="customer-ticket-cancel" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="customer-ticket-confirm" onClick={handlePrint} disabled={busy || !!prepared.error}>
            {busy ? "Abriendo…" : "🖨 Imprimir"}
          </button>
        </footer>
      </section>
    </div>
  ), document.body);
}

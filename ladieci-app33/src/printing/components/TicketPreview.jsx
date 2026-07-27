import { useMemo, useState } from "react";
import { TICKET_TYPES } from "../contracts";
import { PRINT_ORDER_FIXTURES, getPrintFixture } from "../fixtures/orders";
import { normalizeOrderForTicket } from "../normalizeOrderForTicket";
import { renderTicketDocument, ticketDocumentToPlainText } from "../renderTicketDocument";
import { createMockPrinterAdapter, MOCK_OUTCOMES } from "../adapters/mockPrinterAdapter";
import "./TicketPreview.css";

const initialTypeForFixture = (id) => id === "13" ? TICKET_TYPES.KITCHEN_DELTA
  : id === "14" ? TICKET_TYPES.KITCHEN_CORRECTION
  : id === "15" ? TICKET_TYPES.CANCELLATION
  : TICKET_TYPES.KITCHEN;

export default function TicketPreview({ onBack }) {
  const [fixtureId, setFixtureId] = useState("01");
  const [ticketType, setTicketType] = useState(TICKET_TYPES.KITCHEN);
  const [paperWidth, setPaperWidth] = useState(80);
  const [mockOutcome, setMockOutcome] = useState(MOCK_OUTCOMES.SUCCESS);
  const [mockStatus, setMockStatus] = useState("preview_ready");
  const [pending, setPending] = useState(false);

  const { snapshot, document, text } = useMemo(() => {
    const selected = getPrintFixture(fixtureId);
    const normalized = normalizeOrderForTicket(selected.order, {
      ticketType, paperWidth, orderRevision: selected.order.order_revision,
      createdAt: selected.order.snapshot_created_at,
      isReprint: fixtureId === "16", copyNumber: fixtureId === "16" ? 2 : 1,
    });
    const rendered = renderTicketDocument(normalized);
    return { snapshot: normalized, document: rendered, text: ticketDocumentToPlainText(rendered) };
  }, [fixtureId, paperWidth, ticketType]);

  const selectFixture = (event) => {
    const id = event.target.value;
    setFixtureId(id);
    setTicketType(initialTypeForFixture(id));
    setMockStatus("preview_ready");
  };

  const runMock = async () => {
    setPending(true);
    setMockStatus("dialog_opened");
    const result = await createMockPrinterAdapter({ outcome: mockOutcome, latencyMs: 250 }).print(document);
    setMockStatus(result.status);
    setPending(false);
  };

  return (
    <main className="print-preview-page">
      <header className="print-preview-header">
        <div>
          <div className="print-preview-warning">DEV ONLY — PRINT PREVIEW</div>
          <h1>Laboratorio ticket</h1>
          <p>Nessuna rete, persistenza, finestra di stampa o periferica.</p>
        </div>
        <button type="button" onClick={onBack}>Volver</button>
      </header>

      <section className="print-preview-controls" aria-label="Controlli preview">
        <label>Fixture
          <select value={fixtureId} onChange={selectFixture}>
            {PRINT_ORDER_FIXTURES.map((entry) => <option key={entry.id} value={entry.id}>{entry.id} — {entry.label}</option>)}
          </select>
        </label>
        <label>Tipo
          <select value={ticketType} onChange={(event) => setTicketType(event.target.value)}>
            {Object.values(TICKET_TYPES).map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label>Carta
          <select value={paperWidth} onChange={(event) => setPaperWidth(Number(event.target.value))}>
            <option value={58}>58 mm</option><option value={80}>80 mm</option>
          </select>
        </label>
        <label>Esito mock
          <select value={mockOutcome} onChange={(event) => setMockOutcome(event.target.value)}>
            {Object.values(MOCK_OUTCOMES).map((outcome) => <option key={outcome}>{outcome}</option>)}
          </select>
        </label>
        <button type="button" onClick={runMock} disabled={pending}>{pending ? "Simulando…" : "Ejecutar mock"}</button>
        <output className={`print-preview-status is-${mockStatus}`}>{mockStatus}</output>
      </section>

      <section className="print-preview-grid">
        <article>
          <h2>Ticket {ticketType === TICKET_TYPES.CUSTOMER ? "cliente" : "Cocina"}</h2>
          <pre className={`ticket-paper paper-${paperWidth}`}>{text}</pre>
        </article>
        <article>
          <h2>TicketDocument</h2>
          <pre className="ticket-json">{JSON.stringify(document, null, 2)}</pre>
        </article>
        <article>
          <h2>TicketSnapshot</h2>
          <pre className="ticket-json">{JSON.stringify(snapshot, null, 2)}</pre>
        </article>
      </section>
    </main>
  );
}

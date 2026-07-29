import { getLayoutProfile } from "../layoutProfiles";
import { assertTicketDocument } from "../contracts";
import "./TicketDocumentView.css";

export default function TicketDocumentView({ document, className = "" }) {
  assertTicketDocument(document);
  const profile = getLayoutProfile(document.paper_width);

  return (
    <div
      className={`ticket-document paper-${document.paper_width} ${className}`.trim()}
      data-paper-width={document.paper_width}
      style={{ "--ticket-characters-per-line": profile.charactersPerLine }}
    >
      {document.blocks.map((block, index) => {
        if (block.type === "image") {
          return (
            <div key={index} className={`ticket-document-image ${block.role ? `role-${block.role}` : ""}`.trim()}>
              <img src={block.src} alt={block.alt} />
            </div>
          );
        }
        if (block.type === "text") {
          return (
            <div key={index}
              className={`ticket-document-text align-${block.align} emphasis-${block.emphasis} size-${block.size} ${block.role ? `role-${block.role}` : ""}`.trim()}>
              {block.value}
            </div>
          );
        }
        if (block.type === "columns") {
          return (
            <div key={index} className="ticket-document-columns"
              style={{ gridTemplateColumns: block.columns.map((column) => `${column.width}fr`).join(" ") }}>
              {block.columns.map((column, columnIndex) => (
                <span key={columnIndex}
                  className={`align-${column.align} emphasis-${column.emphasis} ${column.role ? `role-${column.role}` : ""}`.trim()}>
                  {column.value}
                </span>
              ))}
            </div>
          );
        }
        if (block.type === "separator") return <div key={index} className="ticket-document-separator" aria-hidden="true" />;
        if (block.type === "feed") return <div key={index} className="ticket-document-feed" style={{ "--ticket-feed-lines": block.lines }} aria-hidden="true" />;
        return null;
      })}
    </div>
  );
}

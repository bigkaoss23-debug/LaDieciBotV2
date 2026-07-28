import {
  TICKET_DOCUMENT_VERSION,
  assertTicketDocument,
  assertTicketSnapshot,
  deepFreeze,
} from "./contracts";
import { getLayoutProfile, wrapText } from "./layoutProfiles";

export const textBlock = (value, options = {}) => ({
  type: "text",
  value: String(value),
  align: options.align || "left",
  emphasis: options.emphasis || "normal",
  size: options.size || "normal",
  role: options.role || null,
});

export const columnsBlock = (columns) => ({
  type: "columns",
  columns: columns.map((column) => ({
    value: String(column.value ?? ""),
    width: column.width,
    align: column.align || "left",
    emphasis: column.emphasis || "normal",
    role: column.role || null,
  })),
});

export const imageBlock = (src, options = {}) => ({
  type: "image",
  src: String(src),
  alt: String(options.alt || ""),
  role: options.role || null,
});

export const separatorBlock = (character = "-") => ({ type: "separator", character });
export const feedBlock = (lines) => ({ type: "feed", lines });
export const cutBlock = (mode = "partial") => ({ type: "cut", mode });

export function createTicketDocument(snapshot, blocks, metadata = {}) {
  assertTicketSnapshot(snapshot);
  const document = {
    document_version: TICKET_DOCUMENT_VERSION,
    ticket_type: snapshot.ticket_type,
    paper_width: snapshot.paper_width,
    metadata: {
      snapshot_version: snapshot.snapshot_version,
      order_id: snapshot.order_id,
      order_revision: snapshot.order_revision,
      copy_number: snapshot.print.copy_number,
      ...metadata,
    },
    blocks,
  };
  assertTicketDocument(document);
  return deepFreeze(document);
}

export function ticketDocumentToPlainText(document) {
  assertTicketDocument(document);
  const profile = getLayoutProfile(document.paper_width);
  const output = [];
  for (const block of document.blocks) {
    if (block.type === "text") {
      for (const line of wrapText(block.value, profile.charactersPerLine)) {
        if (block.align === "center") {
          output.push(`${" ".repeat(Math.max(0, Math.floor((profile.charactersPerLine - line.length) / 2)))}${line}`);
        } else if (block.align === "right") {
          output.push(line.padStart(profile.charactersPerLine));
        } else output.push(line);
      }
    } else if (block.type === "columns") {
      output.push(block.columns.map((column) => {
        const value = String(column.value).slice(0, column.width);
        return column.align === "right" ? value.padStart(column.width) : value.padEnd(column.width);
      }).join(" ").slice(0, profile.charactersPerLine));
    } else if (block.type === "separator") {
      output.push(String(block.character || "-").repeat(profile.charactersPerLine));
    } else if (block.type === "feed") {
      for (let line = 0; line < block.lines; line += 1) output.push("");
    }
  }
  return output.join("\n");
}

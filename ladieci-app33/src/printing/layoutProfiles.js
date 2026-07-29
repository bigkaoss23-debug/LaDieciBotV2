import { assertPaperWidth } from "./contracts";

export const LAYOUT_PROFILES = Object.freeze({
  58: Object.freeze({
    paperWidth: 58,
    charactersPerLine: 32,
    productColumnWidth: 18,
    quantityColumnWidth: 3,
    moneyColumnWidth: 9,
    orderNumberSize: "xlarge",
    separator: "-",
    finalFeedLines: 4,
    cutMode: "partial",
  }),
  80: Object.freeze({
    paperWidth: 80,
    charactersPerLine: 48,
    productColumnWidth: 30,
    quantityColumnWidth: 4,
    moneyColumnWidth: 10,
    orderNumberSize: "xlarge",
    separator: "-",
    finalFeedLines: 5,
    cutMode: "partial",
  }),
});

export function getLayoutProfile(paperWidth) {
  return LAYOUT_PROFILES[assertPaperWidth(paperWidth)];
}

export function wrapText(value, maxLength) {
  const text = String(value ?? "").trim();
  if (!text) return [];
  const lines = [];
  for (const paragraph of text.split(/\n/)) {
    let current = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      if (!current) {
        while (word.length > maxLength) {
          lines.push(word.slice(0, maxLength));
          word = word.slice(maxLength);
        }
        current = word;
      } else if (`${current} ${word}`.length <= maxLength) {
        current += ` ${word}`;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

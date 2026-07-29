const fs = require("fs");
const path = require("path");

const printingRoot = __dirname;
const sourceFiles = [];

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== "__snapshots__") collect(fullPath);
    else if (entry.isFile() && /\.(js|jsx)$/.test(entry.name) && !entry.name.endsWith(".test.js")) sourceFiles.push(fullPath);
  }
}

collect(printingRoot);

test("printing production code contains no network or hardware access", () => {
  const browserAdapter = path.join(printingRoot, "adapters", "browserPrintAdapter.js");
  const source = sourceFiles.filter((file) => file !== browserAdapter)
    .map((file) => fs.readFileSync(file, "utf8")).join("\n");
  [
    /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\baxios\b/,
    /navigator\.(usb|bluetooth)/, /\bwindow\.print\s*\(/, /\bsupabase\b/i,
  ].forEach((pattern) => expect(source).not.toMatch(pattern));
  const adapterSource = fs.readFileSync(browserAdapter, "utf8");
  expect(adapterSource).toContain("window.print()");
  [
    /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\baxios\b/,
    /navigator\.(usb|bluetooth)/, /\bsupabase\b/i, /\blocalStorage\b/,
  ].forEach((pattern) => expect(adapterSource).not.toMatch(pattern));
  expect(adapterSource).not.toMatch(/\bprinted\b/i);
});

// The isolated /print-preview lab route (index.js + featureFlags.js) is dev-only
// tooling and is intentionally not part of the production recovery scope — see
// customerTicketIntegration.static.test.js for the real ModificaOrdenModal wiring.

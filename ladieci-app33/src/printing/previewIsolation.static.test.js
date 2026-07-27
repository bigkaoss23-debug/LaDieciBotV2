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
  const source = sourceFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  [
    /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\baxios\b/,
    /navigator\.(usb|bluetooth)/, /\bwindow\.print\s*\(/, /\bsupabase\b/i,
  ].forEach((pattern) => expect(source).not.toMatch(pattern));
});

test("the preview deep link bypasses operational boot only behind the staging/dev gate", () => {
  const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  const flagSource = fs.readFileSync(path.join(__dirname, "..", "featureFlags.js"), "utf8");
  expect(indexSource).toContain('=== "/print-preview"');
  expect(indexSource).toContain("&& isPrintPreviewEnabled()");
  expect(indexSource).toContain("isIsolatedPrintPreview ? <TicketPreview");
  expect(flagSource).toContain('process.env.NODE_ENV === "development"');
  expect(flagSource).toContain("STAGING_SUPABASE_URL");
});

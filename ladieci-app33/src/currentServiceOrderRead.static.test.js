import fs from "node:fs";
import path from "node:path";

test("the operational order list comes from the authenticated, service-scoped backend", () => {
  const source = fs.readFileSync(path.join(__dirname, "api.js"), "utf8");
  const start = source.indexOf("getOrdenes: async function()");
  const end = source.indexOf("getWaMsgs: async function()", start);
  const block = source.slice(start, end);
  expect(block).toContain('proxyGet("getOrdenes")');
  expect(block).not.toContain('sb.select("ordenes"');
  expect(block).not.toContain("24*60*60*1000");
});

// W5 Packet 01 — standalone unit test for src/api/giroFactsSignal.js.
// No backend, no DB, no browser: node giroFactsSignal.static.test.mjs

import assert from "node:assert";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readGiroFactsSignalVersion } from "../giroFactsSignal.js";

const HERE = dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
async function ck(label, fn) {
  try { await fn(); pass++; console.log("  ✓", label); }
  catch (e) { fail++; console.log("  ✗", label, "—", e.message); }
}

const sbOk = (version) => ({
  select: async (table, query) => {
    assert.strictEqual(table, "config");
    assert.strictEqual(query, "chiave=eq.GIRO_FACTS_SIGNAL");
    return [{ chiave: "GIRO_FACTS_SIGNAL", valore: JSON.stringify({ version, updated_at: "2026-09-15T10:00:00Z" }) }];
  },
});

await ck("W5-X02/X03: reads the version out of the JSON-encoded config row", async () => {
  const v = await readGiroFactsSignalVersion(sbOk(7));
  assert.strictEqual(v, 7);
});

await ck("returns null when the row is missing (never a fabricated version)", async () => {
  const sb = { select: async () => [] };
  const v = await readGiroFactsSignalVersion(sb);
  assert.strictEqual(v, null);
});

await ck("W5-X07: returns null (never throws) when the transport itself fails", async () => {
  const sb = { select: async () => { throw new Error("network down"); } };
  const v = await readGiroFactsSignalVersion(sb);
  assert.strictEqual(v, null);
});

await ck("returns null on malformed JSON (never throws, never guesses)", async () => {
  const sb = { select: async () => [{ chiave: "GIRO_FACTS_SIGNAL", valore: "not json" }] };
  const v = await readGiroFactsSignalVersion(sb);
  assert.strictEqual(v, null);
});

await ck("returns null when the parsed value has no numeric version field", async () => {
  const sb = { select: async () => [{ chiave: "GIRO_FACTS_SIGNAL", valore: JSON.stringify({ updated_at: "x" }) }] };
  const v = await readGiroFactsSignalVersion(sb);
  assert.strictEqual(v, null);
});

await ck("W5-X08: never returns anything beyond the numeric version (no Giro fact leaks through)", async () => {
  const sb = {
    select: async () => [{
      chiave: "GIRO_FACTS_SIGNAL",
      valore: JSON.stringify({ version: 3, updated_at: "x", order_ids: ["#A"], giro_state: "PLANNED" }),
    }],
  };
  const v = await readGiroFactsSignalVersion(sb);
  assert.strictEqual(typeof v, "number");
  assert.strictEqual(v, 3);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

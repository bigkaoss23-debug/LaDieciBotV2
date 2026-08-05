// ONDA 0 — unit tests for the Spanish domain-language guardrail.
// Jest, matching this repo's convention for tooling-script tests
// (see draftGuardWriteLock.test.js). Fixtures are plain strings — no
// dependency on the real working tree.

const {
  scanText,
  isAllowlisted,
  compareToBaseline,
  parseAddedLines,
  countsByFileAndTerm,
} = require("../scripts/lib/domainLanguageGuard");
const { ALLOWLIST_PATTERNS } = require("../scripts/check-domain-language");

function violatingTerms(text) {
  return scanText(text, "fixture.js").violations.map((v) => v.term);
}

describe("domain language guard", () => {
  test("1. chiudiServizio is blocked (camelCase)", () => {
    expect(violatingTerms("function chiudiServizio() {}")).toEqual(["chiudi", "servizio"]);
  });

  test("2. cerrarServicio passes", () => {
    expect(violatingTerms("function cerrarServicio() {}")).toEqual([]);
  });

  test("3. serata_summary is blocked (snake_case)", () => {
    expect(violatingTerms("const t = 'serata_summary';")).toEqual(["serata"]);
  });

  test("4. resumen_cierre_servicio passes", () => {
    expect(violatingTerms("const t = 'resumen_cierre_servicio';")).toEqual([]);
  });

  test("5. agentCucina is blocked", () => {
    expect(violatingTerms("import agentCucina from './agentCucina';")).toEqual(["cucina", "cucina"]);
  });

  test("6. agentCocina passes", () => {
    expect(violatingTerms("import agentCocina from './agentCocina';")).toEqual([]);
  });

  test("7. COMPLETATO (all-caps enum) is blocked", () => {
    expect(violatingTerms("if (estado === 'COMPLETATO') return;")).toEqual(["completato"]);
  });

  test("8. COMPLETADO passes", () => {
    expect(violatingTerms("if (estado === 'COMPLETADO') return;")).toEqual([]);
  });

  test("9. messa_open_session_v1 is blocked in a new runtime file (not allowlisted)", () => {
    expect(isAllowlisted("src/mesa/newMesaHandler.js", ALLOWLIST_PATTERNS)).toBe(false);
    expect(violatingTerms("await callRpc('messa_open_session_v1', args);")).toEqual(["messa"]);
  });

  test("10. the guard's own source is the only allowlisted exception in this repo", () => {
    expect(isAllowlisted("scripts/lib/domainLanguageGuard.js", ALLOWLIST_PATTERNS)).toBe(true);
    expect(isAllowlisted("src/domainLanguageGuard.test.js", ALLOWLIST_PATTERNS)).toBe(true);
    expect(isAllowlisted("src/mesa/mesaApi.js", ALLOWLIST_PATTERNS)).toBe(false);
  });

  test("11. an increase over the baseline fails", () => {
    const baseline = { entries: [{ file: "a.js", term: "servizio", count: 2 }] };
    const current = countsByFileAndTerm([
      { file: "a.js", term: "servizio" },
      { file: "a.js", term: "servizio" },
      { file: "a.js", term: "servizio" },
    ]);
    const cmp = compareToBaseline(current, baseline);
    expect(cmp.ok).toBe(false);
    expect(cmp.increasedEntries).toHaveLength(1);
    expect(cmp.increasedEntries[0]).toMatchObject({ count: 3, baselineCount: 2 });
  });

  test("12. a decrease from the baseline passes", () => {
    const baseline = { entries: [{ file: "a.js", term: "servizio", count: 5 }] };
    const current = countsByFileAndTerm([{ file: "a.js", term: "servizio" }]);
    const cmp = compareToBaseline(current, baseline);
    expect(cmp.ok).toBe(true);
    expect(cmp.increasedEntries).toHaveLength(0);
    expect(cmp.newEntries).toHaveLength(0);
  });

  test("13. a motivated local suppression passes and is reported as a visible exception", () => {
    const text = [
      "// language-guard: allow-legacy kept until the B7 migration lands",
      "const x = chiudiServizio();",
    ].join("\n");
    const { violations, suppressions } = scanText(text, "fixture.js");
    expect(violations).toEqual([]);
    expect(suppressions).toHaveLength(1);
    expect(suppressions[0].line).toBe(2);
    expect(suppressions[0].reason).toMatch(/kept until the B7 migration lands/);
    expect(suppressions[0].terms.slice().sort()).toEqual(["chiudi", "servizio"]);
  });

  test("14. a suppression without a reason fails", () => {
    const text = [
      "// language-guard: allow-legacy",
      "const x = chiudiServizio();",
    ].join("\n");
    const { violations, invalidSuppressions } = scanText(text, "fixture.js");
    expect(invalidSuppressions).toHaveLength(1);
    expect(invalidSuppressions[0].line).toBe(1);
    expect(violations).toHaveLength(2);
  });

  test("15. camelCase, snake_case, kebab-case and action strings are all recognized", () => {
    expect(violatingTerms("const action = 'creaOrdine';")).toEqual(["ordine"]);
    expect(violatingTerms("const tipo_ritiro = 'RITIRO';")).toEqual(["ritiro", "ritiro"]);
    expect(violatingTerms("// chiudi-servizio-action")).toEqual(["chiudi", "servizio"]);
    expect(violatingTerms("if (action === 'updateWaStato') {}")).toEqual([]);
  });

  test("parseAddedLines: only + lines are reported, at their correct new-file line numbers", () => {
    const diff = [
      "diff --git a/src/foo.js b/src/foo.js",
      "index 1111111..2222222 100644",
      "--- a/src/foo.js",
      "+++ b/src/foo.js",
      "@@ -10,2 +10,3 @@",
      " unchanged line",
      "-const old = removed();",
      "+const nuevo = added1();",
      "+const otro = added2();",
      " unchanged line 2",
    ].join("\n");
    const added = parseAddedLines(diff);
    expect([...added.get("src/foo.js")].sort((a, b) => a - b)).toEqual([11, 12]);
  });

  test("no false positive: 'message' does not match the 'messa' blocklist entry", () => {
    expect(violatingTerms("function handleMessage(message) { logMessages(); }")).toEqual([]);
  });
});

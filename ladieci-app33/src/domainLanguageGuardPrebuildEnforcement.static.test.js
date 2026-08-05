// ONDA 0B — proves the Netlify build enforcement mechanism by parsing
// versioned configuration only. No network calls, no live Netlify state.
const fs = require("fs");
const path = require("path");

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

describe("prebuild enforces the language guard ahead of the other guards", () => {
  test("prebuild invokes check-domain-language.js", () => {
    expect(pkg.scripts.prebuild).toMatch(/node scripts\/check-domain-language\.js/);
  });

  test("the language guard runs before guard-no-lab-markers and guard-env-fail-closed", () => {
    const chain = pkg.scripts.prebuild;
    const langIdx = chain.indexOf("check-domain-language.js");
    const labIdx = chain.indexOf("guard-no-lab-markers.js");
    const envIdx = chain.indexOf("guard-env-fail-closed.js");
    expect(langIdx).toBeGreaterThan(-1);
    expect(langIdx).toBeLessThan(labIdx);
    expect(langIdx).toBeLessThan(envIdx);
  });

  test("prebuild is chained with && — a failing guard stops the sequence", () => {
    const steps = pkg.scripts.prebuild.split("&&").map((s) => s.trim());
    expect(steps.length).toBeGreaterThanOrEqual(5);
    expect(steps[0]).toBe("node scripts/check-domain-language.js");
  });

  test("build still runs react-scripts build, unmodified", () => {
    expect(pkg.scripts.build).toBe("react-scripts build");
  });

  test("start is unchanged — the guard is not part of the dev runtime command", () => {
    expect(pkg.scripts.start).toBe("react-scripts start");
  });
});

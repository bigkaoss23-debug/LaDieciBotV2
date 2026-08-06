// MESA_POINTER_TARGET_SHIFT fix -- static proof of the CSS specificity fix.
//
// Root cause: the global `button:active{transform:scale(.96)}` (constants.js,
// mounted app-wide via <style>{G}</style> in App.jsx) has specificity (0,1,1),
// higher than the bare `.mesa-table{transform:translate(-50%,-50%)}` (0,1,0).
// Since `transform` is a single CSS property (never merged across rules), the
// global rule fully replaced the table's own centering translate on native
// :active -- on any real pointerdown (mouse, touch or pen), before the
// matching pointerup/click ever fired. Confirmed on real staging via
// getBoundingClientRect() at each event: 100x100 centered on the click point
// at rest, shrinking to 96x96 and jumping ~52px down-right the instant
// :active engaged -- pushing the release's hit-test onto the parent
// .mesa-board instead of the button.
//
// jsdom does not implement real CSS cascade/specificity resolution or layout,
// so this can only be proven as a text-level assertion against the exported
// CSS source, not via getComputedStyle in a rendered test.
const { mesaCss } = require("./TabMesa");
const fs = require("fs");
const path = require("path");
const constantsSrc = fs.readFileSync(path.join(__dirname, "..", "..", "constants.js"), "utf8");

describe("mesa-table :active keeps its centering transform stable", () => {
  test("the global button:active scale rule still exists (fix is scoped, not a blanket removal)", () => {
    expect(constantsSrc).toMatch(/button:active\{transform:scale\(\.96\)\}/);
  });

  test(".mesa-table:active pins transform to exactly the base centering translate, no scale", () => {
    const match = mesaCss.match(/\.mesa-table:active\{([^}]*)\}/);
    expect(match).not.toBeNull();
    const decl = match[1];
    expect(decl).toMatch(/transform:translate\(-50%,-50%\)/);
    expect(decl).not.toMatch(/scale\(/);
  });

  test(".mesa-table:active has higher specificity than the global button:active rule", () => {
    // .mesa-table:active = 1 class + 1 pseudo-class => (0,2,0)
    // button:active      = 1 type    + 1 pseudo-class => (0,1,1)
    // (0,2,0) > (0,1,1) on the second (class/pseudo-class) component alone.
    const localSelector = ".mesa-table:active";
    const globalSelector = "button:active";
    const specificity = (sel) => {
      const classesAndPseudo = (sel.match(/\.[a-zA-Z0-9_-]+|:[a-zA-Z-]+/g) || []).length;
      const types = (sel.match(/(^|[^.:a-zA-Z0-9_-])[a-zA-Z]+/g) || []).length;
      return [classesAndPseudo, types];
    };
    const [localC] = specificity(localSelector);
    const [globalC] = specificity(globalSelector);
    expect(localC).toBeGreaterThan(globalC);
  });

  test("the base .mesa-table rule still centers via translate(-50%,-50%) at rest", () => {
    const match = mesaCss.match(/\.mesa-table\{([^}]*)\}/);
    expect(match[1]).toMatch(/transform:translate\(-50%,-50%\)/);
  });
});

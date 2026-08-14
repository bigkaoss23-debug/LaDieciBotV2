// MESA_HYBRID_VIEWPORT_01 — source-contract tests for the fixed phone viewport.
//
// WHY THIS IS A STATIC TEST AND NOT A RENDERED ONE
// -----------------------------------------------
// The defect these guard against is a CSS UNIT choice, and jsdom implements no
// layout at all: it reports every element as 0x0 and resolves neither vh nor
// dvh, so a mounted assertion here could only ever re-state the style string it
// just set. The real behavioural proof is a live browser measurement at the
// three required phone sizes (documented in the slice report); what belongs in
// the suite is the thing that can silently regress in a future edit — someone
// reintroducing 100vh on the Mesa phone chain, or dropping the scoped lock.
//
// THE DEFECT
// ----------
// On iOS Safari `100vh` is the LARGE viewport: the height the page would have
// if the URL bar and bottom toolbar were retracted. In the normal state, with
// the toolbars on screen, the visible area is roughly 100px shorter. Three
// rules in this chain were sized in vh — the global html/body/#root minimum,
// App's root, and ServicioPage's shell — so the application box was taller
// than the phone could show, and MesaPhoneShell's bottom <nav>, being the last
// flex item of that box, sat below the fold. The operator had to scroll the
// DOCUMENT to reach the app's own navigation. `100dvh` is the current viewport
// and tracks the toolbars, so the box ends exactly where the visible area does.
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const CONSTANTS = read('constants.js');
const APP = read('App.jsx');
const SERVICIO_PAGE = read('components/ServicioPage.jsx');
const PHONE_SHELL = read('components/mesa/MesaPhoneShell.jsx');

describe('the viewport chain the Mesa phone shell sits in uses dynamic units', () => {
  test('the global html/body/#root minimum is expressed in dvh', () => {
    expect(CONSTANTS).toMatch(/html,body,#root\{min-height:100dvh\}/);
  });

  test('the 100vh declaration is kept as a fallback, never replaced outright', () => {
    // A browser without dvh support must keep today's exact behaviour rather
    // than falling back to `auto` and collapsing the layout.
    expect(CONSTANTS).toMatch(/html,body,#root\{background:#070707 !important;min-height:100vh/);
    expect(CONSTANTS).toMatch(/\.ld-viewport-fill\{min-height:100vh;min-height:100dvh\}/);
    expect(CONSTANTS).toMatch(/\.ld-viewport-shell\{height:100vh;height:100dvh\}/);
  });

  test("App's root uses the shared class instead of an inline vh height", () => {
    expect(APP).toMatch(/<div className="ld-viewport-fill"/);
    expect(APP).not.toMatch(/minHeight:"100vh"/);
  });

  test("ServicioPage's shell uses the shared class instead of an inline vh height", () => {
    expect(SERVICIO_PAGE).toMatch(/<div className="ld-viewport-shell"/);
    expect(SERVICIO_PAGE).not.toMatch(/height:"100vh"/);
  });
});

describe('the fixed-viewport lock is scoped to the Mesa phone shell alone', () => {
  test('the shell adds the lock class on mount', () => {
    expect(PHONE_SHELL).toMatch(/classList\.add\("mesa-fixed-viewport"\)/);
  });

  test('and removes it again on unmount, so every other page keeps normal scrolling', () => {
    expect(PHONE_SHELL).toMatch(/return \(\) => root\.classList\.remove\("mesa-fixed-viewport"\)/);
  });

  test('the lock rule only ever applies under its own html class', () => {
    const rule = CONSTANTS.match(/html\.mesa-fixed-viewport[^}]*\{[^}]*\}/g) || [];
    expect(rule.length).toBeGreaterThan(0);
    rule.forEach((r) => expect(r.startsWith('html.mesa-fixed-viewport')).toBe(true));
  });

  test('the lock hides DOCUMENT overflow but never the shell\'s own inner scrolling', () => {
    expect(CONSTANTS).toMatch(/html\.mesa-fixed-viewport,html\.mesa-fixed-viewport body,html\.mesa-fixed-viewport #root\{[^}]*overflow:hidden/);
    // MesaPhoneShell's <main> keeps its own overflow:auto — Sala/Listos/Más
    // are lists that genuinely need to scroll inside the fixed shell.
    expect(PHONE_SHELL).toMatch(/<main style=\{\{ flex: 1, minHeight: 0, overflow: "auto"/);
  });

  test('no OTHER page is switched to overflow:hidden by this change', () => {
    // Every rule in the global sheet that disables document scrolling must be
    // gated behind the shell's own class. An UNscoped html/body/#root rule
    // would take document scrolling away from the whole application.
    const rules = CONSTANTS.match(/(^|\})\s*([^{}]*(?:html|body|#root)[^{}]*)\{[^}]*overflow:hidden/gm) || [];
    const unscoped = rules.filter((rule) => !rule.includes('.mesa-fixed-viewport'));
    expect(unscoped).toHaveLength(0);
    // ...and the scoped one does exist, so this test cannot pass vacuously.
    expect(rules.length).toBeGreaterThan(0);
  });
});

describe('the shell still composes as one fixed screen', () => {
  test('header, main and nav are all fixed-or-flexing children of one column', () => {
    expect(PHONE_SHELL).toMatch(/flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden"/);
    expect(PHONE_SHELL).toMatch(/<header style=\{\{\s*flexShrink: 0/);
    expect(PHONE_SHELL).toMatch(/<nav style=\{\{\s*flexShrink: 0/);
  });

  test('the bottom nav still reserves the safe-area inset so it is never clipped', () => {
    expect(PHONE_SHELL).toMatch(/padding: "10px 8px calc\(14px \+ env\(safe-area-inset-bottom, 0px\)\)"/);
  });

  test('the top shell still reserves the safe-area inset for the notch', () => {
    expect(PHONE_SHELL).toMatch(/paddingTop: "calc\(14px \+ env\(safe-area-inset-top, 0px\)\)"/);
  });
});

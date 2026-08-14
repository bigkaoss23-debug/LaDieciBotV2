// MESA_HYBRID_FLAG_STABILITY_01 — the Hybrid renderer must survive a rebuild.
//
// The first Hybrid deploy was built locally, with
// REACT_APP_MESA_HYBRID_3D_ENABLED carried only in that shell's environment.
// The deployed bundle therefore had the new renderer while the repository said
// nothing about it, which meant the next legitimate rebuild of this staging
// branch would have compiled the flag as false and quietly reverted the floor
// to the fallback renderer — a visual regression with no diff to explain it.
//
// netlify.toml's [build.environment] is this branch's established, supported
// mechanism for exactly this (REACT_APP_MESA_ENABLED already lives there), so
// the flag is declared alongside it rather than as a new local-only mystery.
// Scope is unchanged: this file is only ever the active config for the staging
// branch; production builds from main, without it.
const fs = require('fs');
const path = require('path');

const NETLIFY_TOML = fs.readFileSync(path.join(__dirname, '..', 'netlify.toml'), 'utf8');
const TAB_MESA = fs.readFileSync(path.join(__dirname, 'components/mesa/TabMesa.jsx'), 'utf8');

describe('the Hybrid renderer flag is declared in the deploy configuration', () => {
  test('netlify.toml sets it for this staging branch', () => {
    expect(NETLIFY_TOML).toMatch(/REACT_APP_MESA_HYBRID_3D_ENABLED = "true"/);
  });

  test('it sits in [build.environment], next to the Mesa UI flag it mirrors', () => {
    const section = NETLIFY_TOML.split('[build.environment]')[1] || '';
    const nextSection = section.split(/^\[\[?/m)[0];
    expect(nextSection).toMatch(/REACT_APP_MESA_ENABLED = "true"/);
    expect(nextSection).toMatch(/REACT_APP_MESA_HYBRID_3D_ENABLED = "true"/);
  });

  test('the value matches exactly the string the component compares against', () => {
    // The flag is read at module scope as a strict === "true" comparison, so a
    // "1"/"TRUE"/"yes" in the config would silently disable the renderer.
    expect(TAB_MESA).toMatch(/process\.env\.REACT_APP_MESA_HYBRID_3D_ENABLED === "true"/);
    const declared = NETLIFY_TOML.match(/REACT_APP_MESA_HYBRID_3D_ENABLED = "([^"]*)"/);
    expect(declared[1]).toBe('true');
  });

  test('it stays a renderer switch only — never a domain or data flag', () => {
    // Off, the component must still be the same Mesa: the flag may only pick
    // which renderer draws the floor.
    expect(TAB_MESA).toMatch(/renderer selection only, never a domain switch/);
  });
});

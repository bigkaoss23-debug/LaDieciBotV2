// Access Control V3-I.1 — static source guards. Same house style as
// src/bootRoutingMenu.static.test.js: raw fs.readFileSync + regex on the real source, so
// wiring/security claims are pinned even where a full runtime mount would be too heavy
// (App.jsx owns a live Supabase Realtime socket) or where the property under test is an
// ABSENCE (a function that is never called, a string that never appears).
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const APP = read('App.jsx');
const MENU = read('components/OperationalMenu.jsx');
const RBAC = read('utils/adminRbac.js');
const CLIENT = read('accessManagement/accessManagementApi.js');
const PAGE = read('components/accessManagement/AccessManagementPage.jsx');
const VIEWMODEL = read('accessManagement/accessUserViewModel.js');

// Strips comments so assertions about what the CODE does (not what a comment merely
// mentions in passing, e.g. explaining which write routes it deliberately omits) are
// checked against executable source only — same technique as bootRoutingMenu.static.test.js.
const code = (src) => src
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

describe('navigation wiring (App.jsx / OperationalMenu.jsx)', () => {
  test('the owner-only menu entry exists inside the isAdmin-gated block', () => {
    const adminBlock = MENU.slice(MENU.indexOf('{isAdmin && ('), MENU.indexOf('Cerrar sesión operativa'));
    expect(adminBlock).toMatch(/Gestión de accesos/);
    expect(adminBlock).toMatch(/onAccessManagement\(\)/);
  });

  test('the menu entry is not reachable outside the isAdmin block (single occurrence)', () => {
    expect((MENU.match(/Gestión de accesos/g) || []).length).toBe(1);
  });

  test('App wires the menu callback to a real screen, gated by canAccessAdminArea', () => {
    expect(APP).toMatch(/onAccessManagement=\{\(\)=>setScreen\("accessmanagement"\)\}/);
    expect(APP).toMatch(/screen==="accessmanagement" && canAccessAdminArea\(auth\.getRole\(\)\)/);
  });

  test('a direct deep link (/accesos) resolves to the same gated screen', () => {
    expect(APP).toMatch(/path === 'accesos'\s*\? 'accessmanagement'/);
  });

  test('reaching the screen without admin redirects home/repartidor — same pattern as the closeout gate', () => {
    const block = APP.slice(APP.indexOf("if (screen !== 'accessmanagement') return;"), APP.indexOf("if (screen !== 'accessmanagement') return;") + 260);
    expect(block).toMatch(/canAccessAdminArea\(auth\.getRole\(\)\)/);
    expect(block).toMatch(/setScreen\(startedAtRepartidor\.current \? 'repartidor' : 'home'\)/);
  });

  test('canAccessAdminArea stays admin-only (reused gate, not a new one)', () => {
    expect(RBAC).toMatch(/export function canAccessAdminArea\(role\)/);
  });
});

describe('read-only guarantee: the access-management API client (Section 17)', () => {
  test('exports exactly the two GET calls plus the path constant — no write function', () => {
    expect(CLIENT).toMatch(/export const ACCESS_USERS_PATH/);
    expect(CLIENT).toMatch(/export async function listAccessUsers/);
    expect(CLIENT).toMatch(/export async function getAccessUser/);
    expect((CLIENT.match(/^export /gm) || []).length).toBe(3);
  });

  test('every fetch call in this module is a GET — no POST/PATCH/PUT/DELETE method literal anywhere', () => {
    expect(CLIENT).not.toMatch(/method:\s*['"](POST|PATCH|PUT|DELETE)['"]/i);
    const methodLines = CLIENT.match(/method:\s*['"][A-Z]+['"]/g) || [];
    expect(methodLines.length).toBeGreaterThan(0);
    for (const line of methodLines) expect(line).toMatch(/GET/);
  });

  test('no write-route path fragment (create/rename/role/pin/deactivate/reactivate) is ever built', () => {
    expect(code(CLIENT)).not.toMatch(/display-name|\/role['"`]|\/pin['"`]|deactivate|reactivate/);
  });

  test('never spreads a raw wire record into the returned user — explicit field allowlist only', () => {
    expect(CLIENT).not.toMatch(/\.\.\.raw/);
    expect(CLIENT).not.toMatch(/\.\.\.r(?![a-zA-Z])/);
  });

  test('forbidden backend fields never appear in this module', () => {
    for (const bad of ['pin_hash', 'pinHash', 'fingerprint', 'failed_count', 'locked_until', 'sid_hash']) {
      expect(CLIENT).not.toMatch(new RegExp(bad));
    }
  });

  test('no direct Supabase client import', () => {
    expect(CLIENT).not.toMatch(/@supabase\/supabase-js/);
    expect(CLIENT).not.toMatch(/createClient\(/);
  });
});

describe('read-only guarantee: the page component (Section 17/19)', () => {
  test('no write-intent button label exists', () => {
    for (const bad of ['Guardar', 'Confirmar', 'Crear acceso', 'Eliminar', 'Desactivar', 'Activar', 'Cambiar rol']) {
      expect(PAGE).not.toMatch(new RegExp(bad));
    }
  });

  test('the list is never persisted to localStorage/sessionStorage — component memory only', () => {
    expect(PAGE).not.toMatch(/localStorage\.setItem/);
    expect(PAGE).not.toMatch(/sessionStorage\.setItem/);
  });

  test('no direct Supabase client access from the page', () => {
    expect(PAGE).not.toMatch(/@supabase\/supabase-js/);
    expect(PAGE).not.toMatch(/createClient\(/);
  });

  test('no hard-coded production backend URL literal', () => {
    expect(PAGE).not.toMatch(/ladiecibot-production/);
    expect(CLIENT).not.toMatch(/ladiecibot-production/);
  });

  test('forbidden backend fields never appear in the page source', () => {
    for (const bad of ['pin_hash', 'pinHash', 'fingerprint', 'failed_count', 'locked_until', 'sessionVersion', 'sid']) {
      expect(PAGE).not.toMatch(new RegExp(bad));
    }
  });

  test('no implementation/migration jargon reaches the page as visible text (V3-I.1 UX)', () => {
    for (const bad of ['Legacy', 'Beta · En desarrollo', 'canonicalRole', 'dbRole']) {
      expect(code(PAGE)).not.toMatch(bad);
    }
  });

  test('no raw actor id is threaded into the UI as a primary/secondary display prop', () => {
    expect(PAGE).not.toMatch(/secondaryLabel=\{u\.actor\}/);
    expect(PAGE).not.toMatch(/displayName \|\| u\.actor/);
  });

  test('the page imports only the two read calls from the client, never a write one', () => {
    const importLine = PAGE.match(/import \{[^}]*\} from '\.\.\/\.\.\/accessManagement\/accessManagementApi';/);
    expect(importLine).toBeTruthy();
    expect(importLine[0]).toMatch(/listAccessUsers/);
    expect(importLine[0]).not.toMatch(/create|rename|role|Pin|deactivate|reactivate/i);
  });

  test('backend authorization comment: frontend gate is defense-in-depth, not the security claim', () => {
    expect(PAGE).toMatch(/gated by canAccessAdminArea/i);
  });
});

describe('presentation-model architecture (Section 5 — no patchwork)', () => {
  test('one centralized view-model module owns presentation decisions', () => {
    expect(VIEWMODEL).toMatch(/export function toAccessUserViewModel/);
    expect(VIEWMODEL).toMatch(/export function buildAccessDirectoryViewModel/);
  });

  test('the page imports and uses the view-model boundary exactly once, not its own presentation logic', () => {
    expect(PAGE).toMatch(/import \{ buildAccessDirectoryViewModel \} from '\.\.\/\.\.\/accessManagement\/accessUserViewModel';/);
    expect((PAGE.match(/buildAccessDirectoryViewModel\(/g) || []).length).toBe(1);
  });

  test('the page does not import roleLabels directly — role wording is owned by the view model only', () => {
    expect(PAGE).not.toMatch(/from '\.\.\/\.\.\/accessManagement\/roleLabels'/);
  });

  test('the page renders no standalone Chip-based role/status/pin badge components', () => {
    expect(PAGE).not.toMatch(/RoleChip|StatusChip|PinChip/);
    expect(PAGE).not.toMatch(/from '\.\.\/ui\/Chip'/);
  });

  test('the view model is transport-free — no fetch, no API import, no write-route vocabulary', () => {
    expect(code(VIEWMODEL)).not.toMatch(/fetch\(/);
    expect(code(VIEWMODEL)).not.toMatch(/accessManagementApi/); // a comment may explain the relationship; the code must not import it
    expect(code(VIEWMODEL)).not.toMatch(/display-name|\/role['"`]|\/pin['"`]|deactivate|reactivate/);
  });

  test('the view model never exposes a raw actor id under an ambiguous field name', () => {
    expect(VIEWMODEL).toMatch(/secondaryTechnicalId/);
    expect(VIEWMODEL).not.toMatch(/secondaryLabel/);
  });

  test('forbidden backend fields never appear in the view-model source', () => {
    for (const bad of ['pin_hash', 'pinHash', 'fingerprint', 'failed_count', 'locked_until', 'sid_hash']) {
      expect(VIEWMODEL).not.toMatch(new RegExp(bad));
    }
  });
});

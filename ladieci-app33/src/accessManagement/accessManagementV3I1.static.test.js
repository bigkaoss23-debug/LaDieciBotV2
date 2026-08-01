// Access Control V3-I — static source guards. Same house style as
// src/bootRoutingMenu.static.test.js: raw fs.readFileSync + regex on the real source, so
// wiring/security claims are pinned even where a full runtime mount would be too heavy
// (App.jsx owns a live Supabase Realtime socket) or where the property under test is an
// ABSENCE (a function that is never called, a string that never appears).
//
// V3-I.1 proved the client/page were strictly read-only. V3-I makes them legitimately
// write-capable — this file now proves the boundary that REMAINS: every write requires
// explicit confirmation + owner step-up, no hard-delete exists, no generic/unrestricted
// write method exists, PIN values are never stored or logged, and the owner has no
// deactivate/role-selector control.
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const APP = read('App.jsx');
const MENU = read('components/OperationalMenu.jsx');
const RBAC = read('utils/adminRbac.js');
const CLIENT = read('accessManagement/accessManagementApi.js');
const PAGE = read('components/accessManagement/AccessManagementPage.jsx');
const VIEWMODEL = read('accessManagement/accessUserViewModel.js');
const PANELS = read('components/accessManagement/AccessOperationPanel.jsx');
const CONTROLLER = read('accessManagement/useAccessOperation.js');
const STEPUP = read('components/ownerStepUp/OwnerStepUpView.jsx');
const ERRORS = read('accessManagement/accessManagementErrors.js');

// Strips comments so assertions about what the CODE does (not what a comment merely
// mentions in passing) are checked against executable source only — same technique as
// bootRoutingMenu.static.test.js.
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

  test('AccessManagementPage receives onLogout from the SAME canonical logout App.jsx already uses — no second logout path', () => {
    expect(APP).toMatch(/<AccessManagementPage onBack=\{[^}]*\} onLogout=\{doOperationalLogout\}\/>/);
  });
});

describe('API client (Section 17): exact write surface, no more, no less', () => {
  test('exports exactly the path constant, the two reads, and the seven writes', () => {
    const exported = (CLIENT.match(/^export (?:const|async function) (\w+)/gm) || [])
      .map((l) => l.replace(/^export (?:const|async function) /, ''));
    expect(exported.sort()).toEqual([
      'ACCESS_USERS_PATH', 'listAccessUsers', 'getAccessUser',
      'createAccessUser', 'renameAccessUser', 'changeAccessUserRole',
      'setAccessUserPin', 'clearAccessUserPin', 'deactivateAccessUser', 'reactivateAccessUser',
    ].sort());
  });

  test('no hard-delete route exists — DELETE is only ever used for /pin, never for the user itself', () => {
    expect(code(CLIENT)).not.toMatch(/DELETE',\s*ACCESS_USERS_PATH\)/);
    expect(code(CLIENT)).not.toMatch(/deleteAccessUser|removeAccessUser|destroyAccessUser/);
  });

  test('there is no generic/unrestricted write function — every write helper is private and each exported method builds its own fixed path', () => {
    expect(CLIENT).not.toMatch(/export (async )?function (patch|put|post|del|write)\(/i);
    expect(CLIENT).toMatch(/^async function accessManagementWrite\(/m); // private, not exported
  });

  test('every write call includes stepUpProof and clientRequestId in its body', () => {
    for (const fn of ['createAccessUser', 'renameAccessUser', 'changeAccessUserRole', 'setAccessUserPin', 'clearAccessUserPin', 'deactivateAccessUser', 'reactivateAccessUser']) {
      const start = CLIENT.indexOf(`export async function ${fn}(`);
      expect(start).toBeGreaterThan(-1);
      const body = CLIENT.slice(start, CLIENT.indexOf('\n}', start));
      expect(body).toMatch(/stepUpProof/);
      expect(body).toMatch(/clientRequestId/);
    }
  });

  test('never spreads a raw wire record into the returned user — explicit field allowlist only', () => {
    expect(CLIENT).not.toMatch(/\.\.\.raw/);
    expect(CLIENT).not.toMatch(/\.\.\.r(?![a-zA-Z])/);
  });

  test('forbidden backend fields never appear in this module\'s executable code', () => {
    for (const bad of ['pin_hash', 'pinHash', 'fingerprint', 'failed_count', 'locked_until', 'sid_hash']) {
      expect(code(CLIENT)).not.toMatch(new RegExp(bad));
    }
  });

  test('the PIN value itself is never logged — no console.log/error/warn touches the pin field', () => {
    expect(code(CLIENT)).not.toMatch(/console\.(log|error|warn)\([^)]*\bpin\b/i);
  });

  test('no direct Supabase client import', () => {
    expect(CLIENT).not.toMatch(/@supabase\/supabase-js/);
    expect(CLIENT).not.toMatch(/createClient\(/);
  });

  test('no hard-coded production backend URL literal', () => {
    expect(CLIENT).not.toMatch(/ladiecibot-production/);
  });
});

describe('page component (Section 20): write controls exist, but only behind the right gates', () => {
  test('the page itself only imports the list READ from the client — every write lives in AccessOperationPanel, not the page', () => {
    const importLine = PAGE.match(/import \{[^}]*\} from '\.\.\/\.\.\/accessManagement\/accessManagementApi';/);
    expect(importLine).toBeTruthy();
    expect(importLine[0]).toMatch(/listAccessUsers/);
    expect(importLine[0]).not.toMatch(/create|rename|changeAccessUserRole|setAccessUserPin|clearAccessUserPin|deactivate|reactivate/i);
  });

  test('all seven write methods are imported exactly once, by the panel module', () => {
    const importLine = PANELS.match(/import \{[^}]*\} from '\.\.\/\.\.\/accessManagement\/accessManagementApi';/);
    expect(importLine).toBeTruthy();
    for (const fn of ['createAccessUser', 'renameAccessUser', 'changeAccessUserRole', 'setAccessUserPin', 'clearAccessUserPin', 'deactivateAccessUser', 'reactivateAccessUser']) {
      expect(importLine[0]).toMatch(fn);
    }
  });

  test('the list is never persisted to localStorage/sessionStorage — component memory only', () => {
    expect(PAGE).not.toMatch(/localStorage\.setItem/);
    expect(PAGE).not.toMatch(/sessionStorage\.setItem/);
    expect(PANELS).not.toMatch(/localStorage\.setItem/);
    expect(PANELS).not.toMatch(/sessionStorage\.setItem/);
  });

  test('no direct Supabase client access from the page or panels', () => {
    for (const src of [PAGE, PANELS]) {
      expect(src).not.toMatch(/@supabase\/supabase-js/);
      expect(src).not.toMatch(/createClient\(/);
    }
  });

  test('no hard-coded production backend URL literal', () => {
    expect(PAGE).not.toMatch(/ladiecibot-production/);
    expect(PANELS).not.toMatch(/ladiecibot-production/);
  });

  test('forbidden backend fields never appear as literal display text in the page source', () => {
    for (const bad of ['pin_hash', 'pinHash', 'fingerprint', 'failed_count', 'locked_until']) {
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

  test('backend authorization comment: frontend gate is defense-in-depth, not the security claim', () => {
    expect(PAGE).toMatch(/gated by canAccessAdminArea/i);
  });

  test('the OWNER row has no deactivate control and no role selector', () => {
    const ownerRowSrc = PAGE.slice(PAGE.indexOf('function OwnerRow'), PAGE.indexOf('function StaffRow'));
    expect(ownerRowSrc).not.toMatch(/Desactivar/);
    expect(ownerRowSrc).not.toMatch(/ROLE_OPTIONS|role-option/);
    expect(ownerRowSrc).not.toMatch(/changeAccessUserRole|deactivateAccessUser/);
  });

  test('the owner PIN flow uses the legacy setActorPin transport, not a V3 write route', () => {
    const ownerPinSrc = PANELS.slice(PANELS.indexOf('export function OwnerPinChangeFlow'), PANELS.indexOf('// ═══ DISPATCHER'));
    expect(ownerPinSrc).toMatch(/api\.setActorPin/);
    expect(ownerPinSrc).not.toMatch(/setAccessUserPin\(/);
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

  test('error copy is centralized in one module — panels never inline a raw backend code as user-facing text', () => {
    expect(ERRORS).toMatch(/export function describeAccessWriteError/);
    expect(PANELS).not.toMatch(/AUTH_[A-Z_]+/); // no raw wire code ever appears as literal panel text
  });
});

describe('owner step-up (Section 14): one canonical proof, reused everywhere', () => {
  test('OwnerStepUpView is the ONE step-up UI, used by both OperationalMenu and the access-management panels', () => {
    expect(MENU).toMatch(/import OwnerStepUpView from '\.\/ownerStepUp\/OwnerStepUpView';/);
    expect(MENU).not.toMatch(/function StepUpView\(/); // no private duplicate left behind
    expect(PANELS).toMatch(/import OwnerStepUpView from '\.\.\/ownerStepUp\/OwnerStepUpView';/);
  });

  test('the step-up proof is read via the SAME operationalSession functions everywhere — no second proof store', () => {
    for (const src of [STEPUP, CONTROLLER, PANELS]) {
      if (/getPinStepUp|setPinStepUp|clearPinStepUp/.test(src)) {
        expect(src).toMatch(/from ['"](\.\.\/)+operationalSession['"]/);
      }
    }
  });

  test('the PIN entered for step-up is never stored outside the in-memory proof — no Storage call in OwnerStepUpView', () => {
    expect(STEPUP).not.toMatch(/localStorage|sessionStorage/);
  });

  test('every panel checks for a step-up proof before submitting — no panel calls a write API function without going through useAccessOperation', () => {
    const writeCalls = ['createAccessUser(', 'renameAccessUser(', 'changeAccessUserRole(', 'setAccessUserPin(', 'clearAccessUserPin(', 'deactivateAccessUser(', 'reactivateAccessUser('];
    for (const call of writeCalls) {
      expect(PANELS).toMatch(new RegExp(`op\\.run\\(\\(stepUpProof, clientRequestId\\) =>\\s*\\n\\s*${call.replace('(', '\\(')}`));
    }
  });

  test('useAccessOperation never invokes the write call without first confirming a live proof exists', () => {
    const runFn = CONTROLLER.slice(CONTROLLER.indexOf('const run = useCallback'), CONTROLLER.indexOf('const cancel = useCallback'));
    expect(runFn).toMatch(/const proof = getPinStepUp\(\);/);
    expect(runFn).toMatch(/if \(!proof\) \{[^}]*setPhase\('awaitingStepUp'\)/);
  });
});

describe('idempotency (Section 15): one key per attempt, never PIN/proof in a log', () => {
  test('the controller generates the clientRequestId exactly once per attempt and reuses it on retry', () => {
    expect(CONTROLLER).toMatch(/generateClientRequestId/);
    expect(CONTROLLER).toMatch(/if \(!clientRequestIdRef\.current\) clientRequestIdRef\.current = generateClientRequestId\(\);/);
  });

  test('cancel() drops the pending clientRequestId — a genuinely new operation never reuses a stale key', () => {
    const cancelFn = CONTROLLER.slice(CONTROLLER.indexOf('const cancel = useCallback'), CONTROLLER.indexOf('const retryAfterStepUp'));
    expect(cancelFn).toMatch(/clientRequestIdRef\.current = null;/);
  });

  test('no PIN, proof, token or sid is ever passed to console.log/error/warn in the controller or panels', () => {
    for (const src of [CONTROLLER, PANELS]) {
      expect(code(src)).not.toMatch(/console\.(log|error|warn)\([^)]*\b(pin|proof|token|sid)\b/i);
    }
  });
});

describe('destructive-action confirmation (Section 20)', () => {
  test('deactivate/clear-PIN/reactivate/role/create panels all render a Cancelar affordance before any write fires', () => {
    for (const fn of ['DeactivateConfirm', 'PinClearConfirm', 'ReactivateConfirm']) {
      const start = PANELS.indexOf(`export function ${fn}(`);
      const body = PANELS.slice(start, PANELS.indexOf('\n}', start + 200));
      expect(body).toMatch(/onCancel=\{onCancel\}/);
    }
  });

  test('no window.confirm/window.alert is used anywhere in the write surface — in-app confirmation only', () => {
    for (const src of [PAGE, PANELS]) {
      expect(src).not.toMatch(/window\.confirm\(/);
      expect(src).not.toMatch(/window\.alert\(/);
    }
  });
});

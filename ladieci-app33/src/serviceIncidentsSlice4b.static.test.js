// SERVICE CLOSEOUT V2 / SLICE 4B — static contract for the incident-surfacing
// UI. This project has no @testing-library (see serviceSessionGate.static.test.js's
// own header), so component wiring that isn't a pure function is pinned at
// the source level. The DECISIONS themselves are unit-tested in
// utils/incidentDisplay.test.js; what follows proves the components are
// actually wired to them, that the banner can never block the operator, and
// that no mutation control was introduced anywhere.

const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const OUTCOME = read('utils/serviceEnsureOutcome.js');
const HOOK = read('hooks/useSilentServiceEnsure.js');
const GATE = read('components/ServiceStateGate.jsx');
const BANNER = read('components/service/PreviousCloseoutIncidentsBanner.jsx');
const APP = read('App.jsx');
const API = read('api.js');
const OP_MENU = read('components/OperationalMenu.jsx');
const INCIDENCIAS = read('components/IncidenciasPage.jsx');
const DISPLAY = read('utils/incidentDisplay.js');

const code = (src) => src
  .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
  .split('\n')
  .filter((l) => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*'); })
  .join('\n');

const GATE_C = code(GATE);
const HOOK_C = code(HOOK);
const OUTCOME_C = code(OUTCOME);
// App.jsx is asserted RAW — same rationale as serviceSessionGate.static.test.js:
// it contains JSX comment blocks the line-stripper mangles, and none of the
// assertions below can be spuriously satisfied by comment text.
const APP_C = APP;
const API_C = code(API);
const OP_MENU_C = code(OP_MENU);
const INCIDENCIAS_C = code(INCIDENCIAS);

describe('operator carryover — response threading, no second API call', () => {
  test('classifyEnsureAttempt copies previousCloseoutIncidents onto the ALLOWED outcome, from the SAME response', () => {
    expect(OUTCOME_C).toMatch(/previousCloseoutIncidents:\s*res\.previousCloseoutIncidents\s*\|\|\s*null/);
  });

  test('no second/dedicated fetch of previous-closeout incidents exists anywhere in the ensure path', () => {
    expect(OUTCOME_C).not.toMatch(/getServiceIncidents|getPreviousCloseout/);
    expect(HOOK_C).not.toMatch(/getServiceIncidents|getPreviousCloseout|fetch\(/);
  });

  test('useSilentServiceEnsure exposes previousCloseoutIncidents from the SAME settle() as session', () => {
    expect(HOOK_C).toMatch(/setPreviousCloseoutIncidents\(outcome\.previousCloseoutIncidents/);
    expect(HOOK_C).toMatch(/return\s*\{[^}]*previousCloseoutIncidents[^}]*\}/);
  });

  test('a non-ALLOWED outcome clears the advisory (never carries stale data into an exception state)', () => {
    expect(HOOK_C).toMatch(/setPreviousCloseoutIncidents\(null\)/);
  });
});

describe('operator banner — mounted alongside {children}, never replacing it', () => {
  test('ServiceStateGate imports and renders PreviousCloseoutIncidentsBanner', () => {
    expect(GATE_C).toMatch(/import PreviousCloseoutIncidentsBanner from/);
    expect(GATE_C).toMatch(/<PreviousCloseoutIncidentsBanner\s+summary=\{previousCloseoutIncidents\}\s*\/>/);
  });

  test('the READY branch still unconditionally renders {children} — the banner is a sibling, not a wrapper/replacement', () => {
    const readyBlockStart = GATE_C.indexOf('ENSURE_PHASE.READY');
    const readyBlock = GATE_C.slice(readyBlockStart, readyBlockStart + 1200);
    expect(readyBlock).toMatch(/<PreviousCloseoutIncidentsBanner/);
    expect(readyBlock).toMatch(/\{children\}/);
    // Banner must appear BEFORE {children} closes the fragment, never conditionally
    // wrapping it (e.g. no `{cond && <>{children}</>}` pattern for the banner itself).
    const bannerIdx = readyBlock.indexOf('<PreviousCloseoutIncidentsBanner');
    const childrenIdx = readyBlock.indexOf('{children}');
    expect(bannerIdx).toBeGreaterThan(-1);
    expect(childrenIdx).toBeGreaterThan(bannerIdx);
  });

  test('the exception/loading branches (blocking states) never render the banner', () => {
    const exceptionIdx = GATE_C.indexOf('ENSURE_PHASE.EXCEPTION');
    const exceptionBlock = GATE_C.slice(exceptionIdx, exceptionIdx + 400);
    expect(exceptionBlock).not.toMatch(/PreviousCloseoutIncidentsBanner/);
  });
});

describe('banner is structurally non-blocking (fixed, pointer-events none, no modal)', () => {
  test('never a full-viewport takeover style', () => {
    expect(BANNER).not.toMatch(/minHeight:\s*['"]100vh['"]/);
    expect(BANNER).not.toMatch(/position:\s*['"]fixed['"][^}]*inset:\s*0/);
  });
  test('positioned fixed, non-interactive (pointerEvents none) — cannot intercept clicks on order controls', () => {
    expect(BANNER).toMatch(/position:\s*['"]fixed['"]/);
    expect(BANNER).toMatch(/pointerEvents:\s*['"]none['"]/);
  });
  test('no modal/dialog/overlay pattern, no onClick handler at all', () => {
    expect(BANNER).not.toMatch(/role=["']dialog["']/);
    expect(BANNER).not.toMatch(/overlay|backdrop/i);
    expect(BANNER).not.toMatch(/onClick/);
  });
  test('renders null (nothing) when describePreviousCloseoutIncidents returns null', () => {
    expect(BANNER).toMatch(/if\s*\(\s*!info\s*\)\s*return\s*null/);
  });
});

describe('read-only surface — no incident mutation anywhere in Slice 4B', () => {
  const MUTATION_PATTERNS = [
    /resolve_service_incident/i,
    /resolveIncident/i,
    /acknowledgeIncident/i,
    /marcar como resuelta/i,
    /["']Resolver["']/,
    /writeOff|write-off/i,
    /reversal/i,
    /deferIncident/i,
  ];
  test.each(MUTATION_PATTERNS.map((re) => [re.toString()]))('IncidenciasPage contains no %s', () => {
    for (const re of MUTATION_PATTERNS) expect(INCIDENCIAS_C).not.toMatch(re);
  });
  test('IncidenciasPage never POSTs — only api.getServiceIncidents (a GET/proxyGet action) is called', () => {
    expect(INCIDENCIAS_C).toMatch(/api\.getServiceIncidents\(/);
    expect(INCIDENCIAS_C).not.toMatch(/proxyPost|api\.post\(/);
  });
  test('the banner component contains no mutation call either', () => {
    for (const re of MUTATION_PATTERNS) expect(BANNER).not.toMatch(re);
  });
  test('no new backend action other than the existing read-only getServiceIncidents was added to api.js for incidents', () => {
    const incidentActionLines = API_C.split('\n').filter((l) => /incident/i.test(l) && /:\s*\(?.*=>/.test(l));
    expect(incidentActionLines.every((l) => /getServiceIncidents/.test(l))).toBe(true);
  });
});

describe('api client — uses the existing proxy abstraction, admin-only backend contract', () => {
  test('getServiceIncidents rides proxyGet, exactly like the other admin-only reads', () => {
    const fnStart = API_C.indexOf('getServiceIncidents:');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = API_C.indexOf('\n  },', fnStart);
    const fnBlock = API_C.slice(fnStart, fnEnd > -1 ? fnEnd : fnStart + 700);
    expect(fnBlock).toMatch(/^getServiceIncidents:\s*\(filters\)\s*=>\s*\{/);
    expect(fnBlock).toMatch(/proxyGet\("getServiceIncidents",\s*params\)/);
    expect(fnBlock).not.toMatch(/proxyPost/);
  });
  test('resolutionStatus is optional — never hardcoded/forced, so the backend actionable default is never shadowed', () => {
    const fnStart = API_C.indexOf('getServiceIncidents:');
    const fnBlock = API_C.slice(fnStart, fnStart + 500);
    expect(fnBlock).toMatch(/if\s*\(f\.resolutionStatus\)/);
  });
});

describe('admin navigation — Incidencias mirrors the accessmanagement admin-only pattern', () => {
  test('App.jsx bounce-back guard exists for the incidencias screen (defense in depth)', () => {
    expect(APP_C).toMatch(/screen !== 'incidencias'\) return;/);
    expect(APP_C).toMatch(/if \(canAccessAdminArea\(auth\.getRole\(\)\)\) return;[\s\S]{0,50}setScreen\(startedAtRepartidor\.current \? 'repartidor' : 'home'\);/);
  });
  test('App.jsx JSX conditional gates IncidenciasPage on canAccessAdminArea, same as AccessManagementPage', () => {
    expect(APP_C).toMatch(/screen==="incidencias" && canAccessAdminArea\(auth\.getRole\(\)\)/);
  });
  test('OperationalMenu renders the Incidencias entry only inside the isAdmin block', () => {
    const adminBlockStart = OP_MENU_C.indexOf('isAdmin &&');
    const adminBlockEnd = OP_MENU_C.indexOf('Cerrar sesión operativa');
    const adminBlock = OP_MENU_C.slice(adminBlockStart, adminBlockEnd);
    expect(adminBlock).toMatch(/onIncidencias/);
  });
  test('Incidencias is NOT wired into the Waiter Mode shell (its own admin/audit surface, not bottom nav)', () => {
    const waiterShell = read('waiter/WaiterShell.jsx');
    expect(waiterShell).not.toMatch(/incidencias/i);
  });
});

describe('historical semantics — superseded stays visually/textually distinct from resolved in the admin page', () => {
  test('IncidenciasPage never hardcodes "Resuelta" for a superseded row — it always goes through describeResolutionStatus', () => {
    expect(INCIDENCIAS_C).toMatch(/describeResolutionStatus\(incident\.resolution_status\)/);
    // No local override string that could shadow the shared mapping.
    expect(INCIDENCIAS_C).not.toMatch(/superseded[^\n]*Resuelta/i);
  });
  test('DISPLAY module never maps superseded to the same label as resolved', () => {
    expect(DISPLAY).toMatch(/superseded:\s*'Superada/);
  });
});

describe('mesa/cocina untouched by this slice', () => {
  test('no mesa/cocina source file was touched (spot check: IncidenciasPage/Banner do not import mesa modules)', () => {
    expect(INCIDENCIAS_C).not.toMatch(/from ['"]\.\.\/mesa/);
    expect(BANNER).not.toMatch(/from ['"]\.\.\/\.\.\/mesa/);
  });
});

// S2-7D5 — static contract for the recovered service-session UI.
//
// This project has no @testing-library, so component behaviour that cannot be
// expressed as a pure function is pinned at the source level, the same way the
// boot-routing and modal-submission contracts are. The DECISIONS themselves are
// unit-tested in utils/openServiceFlow.test.js and utils/serviceSessionState.test.js;
// what follows proves the components are wired to them and that nothing forbidden
// was reintroduced with the port.
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const GATE = read('components/ServiceStateGate.jsx');
const APP = read('App.jsx');
const API = read('api.js');
const SERVICIO = read('components/ServicioPage.jsx');
const CLOSEOUT = read('components/CurrentNightCloseoutPage.jsx');
const MODAL = read('components/NuevoPedidoModal.jsx');
const LIFECYCLE = read('order/submissionLifecycle.js');
const GATEWAY = read('order/persistenceGateway.js');

const code = (src) => src
  .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
  .split('\n')
  .filter((l) => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*'); })
  .join('\n');

const GATE_C = code(GATE);
// App.jsx is asserted RAW: it contains JSX comment blocks and regex literals that
// the line-based stripper mangles. None of the App assertions below can be
// satisfied by comment text, so stripping buys nothing here.
const APP_C = APP;
const API_C = code(API);
const SERVICIO_C = code(SERVICIO);

describe('api — service session rides the CURRENT Auth V2 proxy', () => {
  test('both actions exist and go through proxyGet/proxyPost', () => {
    expect(API_C).toMatch(/getCurrentServiceCloseout:\s*\(\)\s*=>\s*proxyGet\("getCurrentServiceCloseout"\)/);
    expect(API_C).toMatch(/openServiceSession:\s*\(\)\s*=>\s*proxyPost\(\{\s*action:\s*"openServiceSession"\s*\}\)/);
  });

  test('openServiceSession takes NO arguments — the backend derives actor and business date', () => {
    const line = API_C.split('\n').find((l) => l.includes('openServiceSession:'));
    expect(line).not.toMatch(/serviceSessionId|sessionId|businessDate|p_opened_by/);
  });

  // Phase 3 boundary: no legacy auth may come back with the port.
  test('no legacy /api/auth, plaintext PIN or localStorage credential is reintroduced', () => {
    for (const src of [GATE_C, code(CLOSEOUT), API_C]) {
      expect(src).not.toMatch(/["']\/api\/auth["']/);
      expect(src).not.toMatch(/X-Api-Key/);
      expect(src).not.toMatch(/localStorage\.setItem\(\s*["']ld_/);
    }
    expect(API_C).not.toMatch(/APP_PIN|REPARTIDOR_PIN/);
  });
});

describe('the gate is the service-state landing (Phase 4)', () => {
  test('it renders exactly three surfaces: loading, open, closed/error', () => {
    expect(GATE_C).toMatch(/data-testid="service-gate-loading"/);
    expect(GATE_C).toMatch(/data-testid="service-open-status"/);
    expect(GATE_C).toMatch(/data-testid="service-closed-landing"/);
  });

  test('children (the real Servicio) render ONLY under the open phase', () => {
    const openBranch = GATE_C.slice(GATE_C.indexOf('SERVICE_PHASE.OPEN)'));
    expect(openBranch).toMatch(/\{children\}/);
    // there is exactly one place children are rendered
    expect(GATE_C.match(/\{children\}/g)).toHaveLength(1);
  });

  test('the closed landing states the rule and shows verified identity', () => {
    expect(GATE_C).toMatch(/data-testid="service-identity"/);
    expect(GATE_C).toMatch(/Usuario/);
    expect(GATE_C).toMatch(/Rol/);
    // The headline comes from the unit-tested reason helper, not a literal here.
    expect(GATE_C).toMatch(/closedServiceReason\(state\)/);
    expect(read('utils/serviceSessionState.js')).toMatch(/No hay un servicio abierto/);
    expect(GATE).toMatch(/no se puede crear ningún pedido/);
  });

  test('the open control is gated on canOpenService, so a rider never sees it', () => {
    expect(GATE_C).toMatch(/const mayOpen = canOpenService\(role\)/);
    expect(GATE_C).toMatch(/mayOpen && !confirming/);
    expect(GATE_C).toMatch(/mayOpen && confirming/);
    expect(GATE_C).toMatch(/data-testid="service-rider-notice"/);
  });

  test('no session selector is invented anywhere', () => {
    for (const src of [GATE_C, code(CLOSEOUT)]) {
      expect(src).not.toMatch(/serviceSessionId\s*[:=]|sessionId\s*[:=]/);
      expect(src).not.toMatch(/<select/i);
    }
  });

  test('the gate re-reads the state when a write reports the shift was lost', () => {
    expect(GATE_C).toMatch(/ld-service-session-lost/);
  });
});

describe('open confirmation (Phase 5)', () => {
  test('clicking Abrir servicio opens a confirmation, it does not fire the call', () => {
    expect(GATE_C).toMatch(/data-testid="open-service-btn"[\s\S]{0,120}setConfirming\(true\)/);
    expect(GATE_C).not.toMatch(/data-testid="open-service-btn"[\s\S]{0,120}doOpen/);
  });

  test('the confirmation states action, actor, role, date/time, business date and consequence', () => {
    const panel = GATE.slice(GATE.indexOf('data-testid="open-service-confirm"'));
    expect(panel).toMatch(/Abrir nuevo servicio/);
    expect(panel).toMatch(/k="Usuario"/);
    expect(panel).toMatch(/k="Rol"/);
    expect(panel).toMatch(/Fecha y hora/);
    expect(panel).toMatch(/Fecha de servicio/);
    expect(panel).toMatch(/Los nuevos pedidos quedarán vinculados a este servicio/);
  });

  test('cancel exists and sends nothing', () => {
    expect(GATE_C).toMatch(/data-testid="open-service-cancel-btn"[\s\S]{0,160}setConfirming\(false\)/);
  });

  test('the confirm button disables while in flight and shows progress', () => {
    const btn = GATE_C.slice(GATE_C.indexOf('data-testid="open-service-confirm-btn"'));
    expect(btn).toMatch(/disabled=\{opening\}/);
    expect(btn).toMatch(/Abriendo…/);
  });

  test('failures are shown in-app; window.alert / window.confirm are never used', () => {
    expect(GATE_C).toMatch(/data-testid="open-service-error"/);
    expect(GATE_C).not.toMatch(/window\.(alert|confirm)/);
    expect(code(CLOSEOUT)).not.toMatch(/window\.(alert|confirm)/);
  });

  test('the gate delegates to the unit-tested flow, with the synchronous lock', () => {
    expect(GATE_C).toMatch(/runOpenServiceAttempt/);
    expect(GATE_C).toMatch(/createAttemptLock/);
    expect(GATE_C).toMatch(/lockRef\.current\.busy/);
    // Only a VERIFIED open state may enter Servicio.
    expect(GATE_C).toMatch(/ATTEMPT\.OPENED[\s\S]{0,120}setState\(result\.state\)/);
  });
});

describe('closeout routing (Phase 6)', () => {
  test('App routes the closeout screen behind canAccessCurrentCloseout', () => {
    expect(APP_C).toMatch(/screen==="closeout" && canAccessCurrentCloseout\(auth\.getRole\(\)\)/);
    expect(APP_C).toMatch(/<CurrentNightCloseoutPage/);
  });

  test('the /cierre deep link is role-gated, not just hidden', () => {
    expect(APP_C).toMatch(/path === 'cierre'\s*\?\s*'closeout'/);
    expect(APP_C).toMatch(/if \(screen !== 'closeout'\) return;[\s\S]{0,160}canAccessCurrentCloseout/);
  });

  test('Servicio exposes the closeout, so it is not reachable only by deep link', () => {
    expect(SERVICIO_C).toMatch(/data-testid="servicio-closeout-btn"/);
    expect(SERVICIO).toMatch(/Cierre del servicio/);
  });

  test('the principal open path is the landing, not the closeout page', () => {
    // the closeout keeps an open affordance, but only when explicitly permitted
    expect(code(CLOSEOUT)).toMatch(/canOpen && \(/);
    expect(GATE_C).toMatch(/data-testid="open-service-btn"/);
  });
});

describe('close failure handling (Phase 7)', () => {
  test('ServicioPage classifies the outcome instead of trusting HTTP 200', () => {
    expect(SERVICIO_C).toMatch(/import \{ classifyCloseOutcome \}/);
    expect(SERVICIO_C).toMatch(/const outcome = classifyCloseOutcome\(res\)/);
  });

  test('only a real success dismisses the dialog', () => {
    expect(SERVICIO_C).toMatch(/outcome\.kind === "success"[\s\S]{0,220}setChiudiModal\(null\)/);
    // the pre-fix behaviour — dismiss first, ask later — must be gone
    expect(SERVICIO_C).not.toMatch(/handleChiudiConferma = async \(deleteAttivi\) => \{\s*setChiudiModal\(null\)/);
  });

  test('a failure keeps the dialog open with a persistent reason', () => {
    expect(SERVICIO_C).toMatch(/data-testid="close-error"/);
    expect(SERVICIO).toMatch(/El servicio sigue abierto/);
    expect(SERVICIO_C).toMatch(/submitting: false, error: outcome\.message/);
  });

  test('buttons disable while the close is in flight', () => {
    expect(SERVICIO_C).toMatch(/disabled=\{chiudiModal\.submitting\}/);
    expect(SERVICIO_C).toMatch(/Cerrando…/);
  });
});

describe('NO_OPEN_SERVICE_SESSION guidance (Phase 8)', () => {
  test('the refusal is detected and given its own words, not "errore DB"', () => {
    expect(SERVICIO_C).toMatch(/isNoOpenServiceSession\(err\)/);
    expect(SERVICIO_C).toMatch(/NO_OPEN_SERVICE_SESSION_MESSAGE/);
  });

  test('order submission never opens the service by itself', () => {
    expect(SERVICIO_C).not.toMatch(/openServiceSession/);
    expect(code(MODAL)).not.toMatch(/openServiceSession/);
  });

  test('the error is rethrown so the EXISTING lifecycle renders it', () => {
    expect(SERVICIO_C).toMatch(/typed\.code = NO_OPEN_SERVICE_SESSION_CODE;\s*throw typed;/);
    expect(code(MODAL)).toMatch(/return onConfirm\(\{/);
    expect(SERVICIO_C).toMatch(/onConfirm=\{async o=>\{ await addOrden\(o\)/);
  });

  test('the operator is routed back to the service-state landing', () => {
    expect(SERVICIO_C).toMatch(/ld-service-session-lost/);
  });
});

describe('the accepted submission lifecycle at 5062329 is untouched', () => {
  test('no competing submit state machine was added', () => {
    // exactly one reducer and one gateway own order submission
    expect(LIFECYCLE).toMatch(/export function submissionReducer/);
    expect(GATEWAY).toMatch(/export async function submitOrderPayload/);
    for (const s of ['ATTEMPT_STARTED', 'SUBMIT_STARTED', 'RESULT_SUCCESS', 'RESULT_BLOCKED', 'RESULT_ERROR']) {
      expect(LIFECYCLE).toContain(s);
    }
    expect(code(MODAL)).toMatch(/runSubmission\(\{/);
    expect(code(MODAL)).toMatch(/submitOrderPayload\(snap, \{ persist: \(\) => buildAndSendOrder\(snap\) \}\)/);
    // the gate must not import the order lifecycle: they are separate concerns
    expect(GATE_C).not.toMatch(/submissionLifecycle|persistenceGateway/);
  });

  test('SUCCESS remains the only outcome that clears the form', () => {
    expect(code(MODAL)).toMatch(/if \(submission\.phase !== PHASE\.SUCCESS\) return;\s*reset\(\);/);
  });
});

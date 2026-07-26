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
const CONTROLLER = read('components/service/useOpenServiceController.js');
const CONFIRM = read('components/service/OpenServiceConfirmation.jsx');

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
    // the gate asks the shared controller; the role rule itself lives there
    expect(GATE_C).toMatch(/open\.mayOpen && !open\.confirming/);
    expect(GATE_C).toMatch(/open\.mayOpen && open\.confirming/);
    expect(code(CONTROLLER)).toMatch(/const mayOpen = canOpenService\(role\)/);
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

// ── S2-7D5B — ONE guarded opening path, shared by both entry points ─────────
describe('the shared open-service controller', () => {
  const CTRL = code(CONTROLLER);
  const CONF = code(CONFIRM);

  test('the controller is the ONLY caller of api.openServiceSession', () => {
    expect(CTRL).toMatch(/api\.openServiceSession\(\)/);
    // every other component must go through it
    for (const src of [GATE_C, code(CLOSEOUT), SERVICIO_C, code(MODAL), APP_C]) {
      expect(src).not.toMatch(/api\.openServiceSession/);
    }
  });

  test('the closeout page no longer opens the service directly', () => {
    const C = code(CLOSEOUT);
    expect(C).toMatch(/useOpenServiceController/);
    expect(C).toMatch(/<OpenServiceConfirmation/);
    // the S2-7D5 unguarded handler is gone
    expect(C).not.toMatch(/classifyOpenAttempt|openingRef|const openService =/);
  });

  test('both entry points mount the same controller and the same confirmation', () => {
    for (const src of [GATE_C, code(CLOSEOUT)]) {
      expect(src).toMatch(/useOpenServiceController\(\{/);
      expect(src).toMatch(/<OpenServiceConfirmation/);
      expect(src).toMatch(/open\.requestOpen/);
      expect(src).toMatch(/onConfirm=\{open\.confirm\}/);
      expect(src).toMatch(/onCancel=\{open\.cancel\}/);
      expect(src).toMatch(/open\.mayOpen/);
    }
  });

  test('the opening logic is not duplicated: one lock, one flow, one classifier', () => {
    expect(CTRL).toMatch(/createAttemptLock/);
    expect(CTRL).toMatch(/runOpenServiceAttempt/);
    expect(CTRL).toMatch(/lockRef\.current\.busy/);
    for (const src of [GATE_C, code(CLOSEOUT)]) {
      expect(src).not.toMatch(/createAttemptLock|runOpenServiceAttempt/);
    }
  });

  test('the first click only asks: requestOpen sends nothing', () => {
    expect(CTRL).toMatch(/const requestOpen = useCallback\(\(\) => \{[\s\S]{0,200}setConfirming\(true\)/);
    const req = CTRL.slice(CTRL.indexOf('const requestOpen'), CTRL.indexOf('const cancel'));
    expect(req).not.toMatch(/api\.|runOpenServiceAttempt/);
  });

  test('cancel sends nothing and cannot fire mid-flight', () => {
    const cancel = CTRL.slice(CTRL.indexOf('const cancel'), CTRL.indexOf('const confirm'));
    expect(cancel).not.toMatch(/api\.|runOpenServiceAttempt/);
    expect(cancel).toMatch(/lockRef\.current\.busy/);
    expect(cancel).toMatch(/setConfirming\(false\)/);
  });

  test('unknown roles fail closed, at render AND at the moment of action', () => {
    expect(CTRL).toMatch(/const mayOpen = canOpenService\(role\)/);
    expect(CTRL).toMatch(/if \(!mayOpen\) \{ setError/);
    expect(CTRL).toMatch(/if \(!mayOpen\) return;/);
  });

  test('only a VERIFIED open state counts as success', () => {
    expect(CTRL).toMatch(/ATTEMPT\.OPENED[\s\S]{0,160}onOpened\(result\.state\)/);
    expect(CTRL).toMatch(/setError\(result\.message\)/);
  });

  test('the confirmation states action, actor, role, date/time, business date and consequence', () => {
    expect(CONFIRM).toMatch(/data-testid="open-service-confirm"/);
    expect(CONFIRM).toMatch(/k="Acción" v="Abrir nuevo servicio"/);
    expect(CONFIRM).toMatch(/k="Usuario"/);
    expect(CONFIRM).toMatch(/k="Rol"/);
    expect(CONFIRM).toMatch(/Fecha y hora/);
    expect(CONFIRM).toMatch(/Fecha de servicio/);
    expect(CONFIRM).toMatch(/Los nuevos pedidos quedarán vinculados a este servicio/);
  });

  test('the confirm button disables while in flight and shows progress', () => {
    const btn = CONF.slice(CONF.indexOf('data-testid="open-service-confirm-btn"'));
    expect(btn).toMatch(/disabled=\{opening\}/);
    expect(btn).toMatch(/Abriendo…/);
  });

  test('failures are shown in-app; window.alert / window.confirm are never used', () => {
    expect(CONF).toMatch(/data-testid="open-service-error"/);
    for (const src of [CONF, CTRL, GATE_C, code(CLOSEOUT)]) {
      expect(src).not.toMatch(/window\.(alert|confirm)/);
    }
  });

  test('the confirmation surface issues no requests of its own', () => {
    expect(CONF).not.toMatch(/api\.|fetch\(/);
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
    // the closeout keeps an open affordance, but through the shared guarded path
    expect(code(CLOSEOUT)).toMatch(/open\.mayOpen && !open\.confirming/);
    expect(code(CLOSEOUT)).toMatch(/data-testid="closeout-open-btn"/);
    expect(GATE_C).toMatch(/data-testid="open-service-btn"/);
    // and a verified open from Cierre returns the operator to Servicio
    expect(code(CLOSEOUT)).toMatch(/onServiceOpened/);
    expect(APP_C).toMatch(/onServiceOpened=\{\(\)=>setScreen\("servicio"\)\}/);
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

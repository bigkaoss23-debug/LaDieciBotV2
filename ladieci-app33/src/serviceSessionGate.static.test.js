// S2-7D5 — static contract for the recovered service-session UI.
// S2-7D6C — silent ensure replaces the manual confirm-then-open landing as the
// NORMAL entry path. The manual controller (useOpenServiceController +
// OpenServiceConfirmation) is untouched code, but is now mounted ONLY by the
// closeout page, as an explicit, secondary, admin/operator-only recovery
// affordance — never by the gate itself.
//
// This project has no @testing-library, so component behaviour that cannot be
// expressed as a pure function is pinned at the source level, the same way the
// boot-routing and modal-submission contracts are. The DECISIONS themselves are
// unit-tested in utils/serviceEnsureFlow.test.js, utils/serviceEnsureOutcome.test.js
// and utils/openServiceFlow.test.js; what follows proves the components are
// wired to them and that nothing forbidden was reintroduced with the port.
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const GATE = read('components/ServiceStateGate.jsx');
const EXCEPTION_PANEL = read('components/service/ServiceExceptionPanel.jsx');
const HOOK = read('hooks/useSilentServiceEnsure.js');
const FLOW = read('utils/serviceEnsureFlow.js');
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
const EXCEPTION_PANEL_C = code(EXCEPTION_PANEL);
const HOOK_C = code(HOOK);
const FLOW_C = code(FLOW);
// App.jsx is asserted RAW: it contains JSX comment blocks and regex literals that
// the line-based stripper mangles. None of the App assertions below can be
// satisfied by comment text, so stripping buys nothing here.
const APP_C = APP;
const API_C = code(API);
const SERVICIO_C = code(SERVICIO);

describe('api — service session rides the CURRENT Auth V2 proxy', () => {
  test('both legacy actions exist and go through proxyGet/proxyPost', () => {
    expect(API_C).toMatch(/getCurrentServiceCloseout:\s*\(\)\s*=>\s*proxyGet\("getCurrentServiceCloseout"\)/);
    expect(API_C).toMatch(/openServiceSession:\s*\(\)\s*=>\s*proxyPost\(\{\s*action:\s*"openServiceSession"\s*\}\)/);
  });

  test('openServiceSession takes NO arguments — the backend derives actor and business date', () => {
    const line = API_C.split('\n').find((l) => l.includes('openServiceSession:'));
    expect(line).not.toMatch(/serviceSessionId|sessionId|businessDate|p_opened_by/);
  });

  // S2-7D6C — the silent action.
  test('ensureCurrentServiceSession exists, goes through proxyPost, and takes NO arguments', () => {
    expect(API_C).toMatch(/ensureCurrentServiceSession:\s*\(\)\s*=>\s*proxyPost\(\{\s*action:\s*"ensureCurrentServiceSession"\s*\}\)/);
    const line = API_C.split('\n').find((l) => l.includes('ensureCurrentServiceSession:'));
    expect(line).not.toMatch(/serviceKind|sessionId|businessDate|p_opened_by/);
  });

  // Phase 3 boundary: no legacy auth may come back with the port.
  test('no legacy /api/auth, plaintext PIN or localStorage credential is reintroduced', () => {
    for (const src of [GATE_C, code(CLOSEOUT), API_C, EXCEPTION_PANEL_C, HOOK_C, FLOW_C]) {
      expect(src).not.toMatch(/["']\/api\/auth["']/);
      expect(src).not.toMatch(/X-Api-Key/);
      expect(src).not.toMatch(/localStorage\.setItem\(\s*["']ld_/);
    }
    expect(API_C).not.toMatch(/APP_PIN|REPARTIDOR_PIN/);
  });
});

describe('the gate silently ensures a session on entry (S2-7D6C)', () => {
  test('it renders exactly two surfaces of its own: loading and open — exceptions are delegated', () => {
    expect(GATE_C).toMatch(/data-testid="service-gate-loading"/);
    expect(GATE_C).toMatch(/data-testid="service-open-status"/);
    // no normal "closed landing" surface is invented here anymore
    expect(GATE_C).not.toMatch(/data-testid="service-closed-landing"/);
    expect(GATE_C).toMatch(/<ServiceExceptionPanel/);
  });

  test('children (the real Servicio) render ONLY under ENSURE_PHASE.READY', () => {
    const readyBranch = GATE_C.slice(GATE_C.indexOf('ENSURE_PHASE.READY)'));
    expect(readyBranch).toMatch(/\{children\}/);
    // there is exactly one place children are rendered
    expect(GATE_C.match(/\{children\}/g)).toHaveLength(1);
  });

  test('the gate calls useSilentServiceEnsure, never the manual controller', () => {
    expect(GATE_C).toMatch(/useSilentServiceEnsure\(\{\s*role\s*\}\)/);
    expect(GATE_C).not.toMatch(/useOpenServiceController/);
    expect(GATE_C).not.toMatch(/OpenServiceConfirmation/);
    expect(GATE_C).not.toMatch(/api\.openServiceSession/);
    expect(GATE_C).not.toMatch(/api\.ensureCurrentServiceSession/); // goes through the hook, not a direct call
  });

  test('no confirmation, no success UI: a normal ready render shows only the status pill', () => {
    expect(GATE_C).not.toMatch(/¿Quieres abrir|Confirmar y abrir|Abrir servicio/i);
    expect(GATE_C).not.toMatch(/window\.(alert|confirm)/);
  });

  test('the status pill uses ensuredStatusLabel(session) — never a browser-clock-derived label', () => {
    expect(GATE_C).toMatch(/ensuredStatusLabel\(session\)/);
    expect(GATE_C).not.toMatch(/new Date\(\)\.getHours/);
  });

  test('a role that may not open (rider, unknown) never sees a normal shell — the hook fails it closed', () => {
    // the role rule lives in serviceEnsureFlow.js, not re-derived in the gate
    expect(FLOW_C).toMatch(/canOpenService\(role\)/);
    expect(FLOW_C).toMatch(/if\s*\(!canOpenService\(role\)\)/);
    expect(EXCEPTION_PANEL_C).toMatch(/data-testid="service-rider-notice"/);
    expect(EXCEPTION_PANEL_C).toMatch(/isRider\(role\)/);
  });

  test('no session selector is invented anywhere', () => {
    for (const src of [GATE_C, code(CLOSEOUT), EXCEPTION_PANEL_C]) {
      expect(src).not.toMatch(/serviceSessionId\s*[:=]|sessionId\s*[:=]/);
      expect(src).not.toMatch(/<select/i);
    }
  });

  test('a lost mid-shift session triggers a SILENT recheck, not the visible retry/loading phase', () => {
    expect(GATE_C).toMatch(/ld-service-session-lost/);
    expect(GATE_C).toMatch(/recheckSilently/);
  });
});

describe('useSilentServiceEnsure / serviceEnsureFlow — the state machine (S2-7D6C)', () => {
  test('the five required phases exist, named clearly', () => {
    for (const p of ['IDLE', 'ENSURING', 'READY', 'EXCEPTION', 'RETRYING']) {
      expect(HOOK_C).toMatch(new RegExp(`${p}:`));
    }
  });

  test('exactly ONE shared in-flight ensure exists at module scope — every mount funnels through it', () => {
    expect(HOOK_C).toMatch(/createSharedEnsure/);
    expect(FLOW_C).toMatch(/export function createSharedEnsure/);
    // the module-level singleton, not one per hook call
    expect(HOOK_C).toMatch(/^const sharedEnsure = createSharedEnsure\(/m);
  });

  test('retry and the initial mount both go through the same run(), never a second code path', () => {
    expect(HOOK_C).toMatch(/const retry = useCallback\(\(\) => \{ run\(ENSURE_PHASE\.RETRYING\); \}/);
    expect(HOOK_C.match(/attemptSilentEnsure/g).length).toBeGreaterThanOrEqual(1);
  });

  test('recheckSilently never sets a visible loading phase — it only reacts to the settled outcome', () => {
    const recheck = HOOK_C.slice(HOOK_C.indexOf('const recheckSilently'));
    expect(recheck).toMatch(/run\(null\)/);
  });

  test('client input never substitutes for the backend verdict: no local schedule/window logic', () => {
    for (const src of [HOOK_C, FLOW_C, GATE_C]) {
      expect(src).not.toMatch(/PRANZO_WINDOW|SERA_WINDOW|BETWEEN_SERVICES\s*=|getHours\(\)\s*[<>]=/);
    }
  });
});

describe('serviceEnsureOutcome — every backend outcome is mapped, none invented (S2-7D6C)', () => {
  const OUTCOME = read('utils/serviceEnsureOutcome.js');
  test('every documented typed code from the backend contract is present', () => {
    for (const c of [
      'BETWEEN_SERVICES', 'AFTER_ORDER_CUTOFF', 'OUTSIDE_WINDOWS',
      'SERVICE_ALREADY_COMPLETED_TODAY', 'LUNCH_SESSION_STILL_ACTIVE',
      'OTHER_SERVICE_STILL_ACTIVE', 'SERVICE_SESSION_CLOSING', 'INVALID_ACTOR',
    ]) {
      expect(OUTCOME).toContain(`'${c}'`);
    }
  });
  test('created:true and created:false both classify to the SAME ALLOWED kind', () => {
    expect(OUTCOME).toMatch(/if \(res\.success === true\)/);
    expect(OUTCOME).not.toMatch(/created\s*===\s*true[\s\S]{0,80}kind:\s*['"]?CREATED_ALLOWED/);
  });
});

describe('ServiceExceptionPanel — natural Spanish, no raw codes, retry gated correctly (S2-7D6C)', () => {
  test('title and message come from the classifier, never a literal per-code string here', () => {
    expect(EXCEPTION_PANEL_C).toMatch(/exception\.title/);
    expect(EXCEPTION_PANEL_C).toMatch(/exception\.message/);
    expect(EXCEPTION_PANEL_C).not.toMatch(/BETWEEN_SERVICES|LUNCH_SESSION_STILL_ACTIVE|AFTER_ORDER_CUTOFF/);
  });
  test('retry is gated by exceptionAllowsRetry, the closeout link by exceptionShowsCloseoutLink', () => {
    expect(EXCEPTION_PANEL_C).toMatch(/exceptionAllowsRetry\(kind\)/);
    expect(EXCEPTION_PANEL_C).toMatch(/exceptionShowsCloseoutLink\(kind\)/);
  });
  test('no requests of its own, no window dialogs', () => {
    expect(EXCEPTION_PANEL_C).not.toMatch(/api\.|fetch\(/);
    expect(EXCEPTION_PANEL_C).not.toMatch(/window\.(alert|confirm)/);
  });
  test('the identity grid is the same shared building block as the manual confirmation', () => {
    expect(EXCEPTION_PANEL_C).toMatch(/import \{ Row, identityGrid, fmtDate, fmtTime, roleLabelOf/);
  });
});

// ── S2-7D5B — the manual recovery path, now closeout-only (S2-7D6C) ─────────
describe('the manual open-service controller is now an exceptional recovery path only', () => {
  const CTRL = code(CONTROLLER);
  const CONF = code(CONFIRM);

  test('the controller is the ONLY caller of api.openServiceSession', () => {
    expect(CTRL).toMatch(/api\.openServiceSession\(\)/);
    // every other component must go through it (or not open the service at all)
    for (const src of [GATE_C, code(CLOSEOUT), SERVICIO_C, code(MODAL), APP_C, EXCEPTION_PANEL_C, HOOK_C, FLOW_C]) {
      expect(src).not.toMatch(/api\.openServiceSession/);
    }
  });

  // G-1 — the closeout page opens NOTHING any more. The Operational Service
  // resumes by itself on the next real order or table seating, so a manual
  // open affordance on a report page is lifecycle bureaucracy with no job.
  test('the closeout page mounts no open flow at all', () => {
    const C = code(CLOSEOUT);
    expect(C).not.toMatch(/useOpenServiceController/);
    expect(C).not.toMatch(/OpenServiceConfirmation/);
    expect(C).not.toMatch(/Abrir nuevo servicio/);
    expect(C).not.toMatch(/closeout-open-btn|closeout-reopen-btn/);
    // the S2-7D5 unguarded handler is still gone, and never came back
    expect(C).not.toMatch(/classifyOpenAttempt|openingRef|const openService =/);
    // it stays a report: it still reads the contract and nothing else
    expect(C).toMatch(/api\.getCurrentServiceCloseout\(\)/);
  });

  // S2-7D6C2 — the closeout says WHICH service it reports, from the contract only.
  test('the closeout kind comes from closeout.serviceKind and nothing else', () => {
    const C = code(CLOSEOUT);
    expect(C).toMatch(/describeCloseoutKind\(data\)/);
    // never the clock, never a date/status inference, never the ensure session
    expect(C).not.toMatch(/new Date\(\)|Date\.now\(|getHours\(/);
    expect(C).not.toMatch(/serviceKind[\s\S]{0,60}(businessDate|status)/);
    expect(C).not.toMatch(/useSilentServiceEnsure|ensuredStatusLabel/);
    // the title/eyebrow are rendered from the helper, not hardcoded literals
    expect(C).toMatch(/\{kind\.eyebrow\}/);
    expect(C).toMatch(/\{kind\.title\}/);
    expect(C).not.toMatch(/>SERVICIO ACTUAL</);
  });

  // G-1 — there is no mount point left anywhere in the operational surface.
  // The controller and the confirmation modal still EXIST as modules (the
  // confirmation also exports shared styling used by Access Management), and
  // retiring them is its own slice; what must be true now is that no screen
  // an operator can reach offers a manual open.
  test('no operator-reachable screen mounts the manual open controller any more', () => {
    for (const src of [code(CLOSEOUT), GATE_C, SERVICIO_C, APP_C, EXCEPTION_PANEL_C]) {
      expect(src).not.toMatch(/useOpenServiceController\(\{/);
      expect(src).not.toMatch(/<OpenServiceConfirmation/);
      expect(src).not.toMatch(/open\.requestOpen|open\.mayOpen|open\.confirm\b/);
    }
  });

  test('the opening logic is not duplicated: one lock, one flow, one classifier — untouched', () => {
    expect(CTRL).toMatch(/createAttemptLock/);
    expect(CTRL).toMatch(/runOpenServiceAttempt/);
    expect(CTRL).toMatch(/lockRef\.current\.busy/);
    for (const src of [GATE_C, code(CLOSEOUT), HOOK_C, FLOW_C]) {
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

  test('Servicio exposes the read-only report, so it is not reachable only by deep link', () => {
    expect(SERVICIO_C).toMatch(/data-testid="servicio-closeout-btn"/);
    // FIN-01/UX-01 — this button opens the READ-ONLY report, so it is now named
    // "Resumen", never "Cierre": the old orange "Cierre" label sat next to an
    // unlabelled 🌙 that was the real Finalizar, and the owner pressed the
    // wrong one on 2026-08-20 (service 480eca89 was never finalized).
    expect(SERVICIO).toMatch(/>\s*Resumen\s*</);
    expect(SERVICIO).toMatch(/aria-label="Resumen del servicio \(solo lectura\)"/);
    expect(SERVICIO).not.toMatch(/aria-label="Cierre del servicio"/);
  });

  // FIN-01 — the end-of-service action must be readable WITHOUT hover, title or
  // a screen reader: the operator is on a tablet. An accessible name alone was
  // already tried (UAT-P3, commit 09d3e0f, live before the 2026-08-20 service)
  // and did not work, because a `title` needs a mouse the operator does not
  // have. The visible text is the fix; the accessible name stays as well.
  test('the true Finalizar is a VISIBLE labelled action, not a bare icon', () => {
    expect(SERVICIO_C).toMatch(/data-testid="servicio-finalizar-btn"/);
    expect(SERVICIO).toMatch(/<span>Finalizar servicio<\/span>/);
    expect(SERVICIO).toMatch(/aria-label="Finalizar servicio"/);
    // VISUAL CONSISTENCY PASS 1 — the moon survives as decoration only, and is
    // still explicitly hidden from the a11y tree; it is now the shared Mesa
    // vector marker instead of the 🌙 emoji (the action bar no longer mixes
    // emoji with vector icons). The visible label and the accessible name —
    // the two things FIN-01 actually depends on — are asserted above.
    expect(SERVICIO).toMatch(/<MS\.MesaIcon d=\{MS\.ICON_MOON\}/);
    const MESA_SURFACE = fs.readFileSync(
      path.join(__dirname, 'components', 'ui', 'mesaSurface.jsx'), 'utf8');
    expect(MESA_SURFACE).toMatch(/export const MesaIcon[\s\S]{0,400}aria-hidden="true"/);
  });

  test('Finalizar routes to the existing confirmation flow, and no second close path exists', () => {
    // The pre-existing identifiers this test asserts the wiring of. Named once,
    // here, so the rest of the test reads in the project's own vocabulary.
    // language-guard: allow-legacy the existing close handler/pre-flight identifiers, quoted verbatim to prove the wiring is unchanged, not new vocabulary
    const [CLOSE_HANDLER, CONFIRM_HANDLER, SCAN_ACTION] = ['handleChiudiServizio', 'handleChiudiConferma', 'scanServizio'];

    // one handler, one wiring, unchanged
    expect(SERVICIO_C).toMatch(new RegExp(`data-testid="servicio-finalizar-btn"\\s+onClick=\\{${CLOSE_HANDLER}\\}`));
    expect(SERVICIO_C.match(new RegExp(`onClick=\\{${CLOSE_HANDLER}\\}`, 'g'))).toHaveLength(1);
    // the confirmation still goes through the pre-flight scan + the existing modal
    expect(SERVICIO_C).toMatch(new RegExp(`api\\.get\\("${SCAN_ACTION}"\\)`));
    expect(SERVICIO_C).toMatch(new RegExp(CONFIRM_HANDLER));
    // and the report button is NOT wired to any close handler
    expect(SERVICIO_C).toMatch(/data-testid="servicio-closeout-btn"\s+onClick=\{onCloseout\}/);
    expect(SERVICIO_C).not.toMatch(
      new RegExp(`data-testid="servicio-closeout-btn"[\\s\\S]{0,200}${CLOSE_HANDLER.slice(0, 12)}`));
  });

  // G-1 — the entry path is silent ensure, and there is no longer a manual
  // affordance ANYWHERE to fall back to: the Operational Service resumes on
  // the first real order or table seating, so an operator never has to open
  // one by hand. MANUAL_ABRIR_NUEVO_SERVICIO_REQUIRED = NO, enforced here.
  test('no screen offers a manual "abrir servicio" affordance any more (S2-7D6C + G-1)', () => {
    expect(GATE_C).not.toMatch(/data-testid="open-service-btn"/);
    expect(GATE_C).not.toMatch(/data-testid="landing-closeout-btn"/);
    expect(code(CLOSEOUT)).not.toMatch(/data-testid="closeout-open-btn"/);
    expect(code(CLOSEOUT)).not.toMatch(/data-testid="closeout-reopen-btn"/);
    // no screen renders the copy either — not as a button, not as a hint
    for (const src of [GATE_C, code(CLOSEOUT), SERVICIO_C, EXCEPTION_PANEL_C]) {
      expect(src).not.toMatch(/Abrir nuevo servicio/);
    }
    // and App no longer has to route the operator back after a manual open,
    // because there is no manual open to come back from
    expect(code(CLOSEOUT)).not.toMatch(/onServiceOpened/);
    expect(APP_C).not.toMatch(/onServiceOpened=/);
    // a finalized report says what happens next instead of asking for an action
    expect(code(CLOSEOUT)).toMatch(/data-testid="closeout-finalized-note"/);
  });

  test('the exception panel offers "Ver resumen del servicio" as its own escape hatch, never a duplicate confirm flow', () => {
    expect(EXCEPTION_PANEL_C).toMatch(/data-testid="service-exception-closeout-btn"/);
    // UX-01 — same read-only destination as the Servicio bar's Resumen, so it
    // must not promise a "cierre" it cannot perform
    expect(EXCEPTION_PANEL_C).toMatch(/Ver resumen del servicio/);
    expect(EXCEPTION_PANEL_C).not.toMatch(/Ver cierre del servicio/);
    // it imports shared presentational pieces (Row/identityGrid/...) from that
    // file, but never renders <OpenServiceConfirmation> or mounts the hook
    expect(EXCEPTION_PANEL_C).not.toMatch(/<OpenServiceConfirmation/);
    expect(EXCEPTION_PANEL_C).not.toMatch(/useOpenServiceController\(/);
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
    // language-guard: allow-legacy handleChiudiConferma is the existing close-confirm handler name, quoted verbatim below to prove the wiring is unchanged, not new vocabulary
    // N-2 — handleChiudiConferma dropped its deleteAttivi parameter: the
    // backend's V3 close engine (the only path any session can take now)
    // never read it. Regex updated to the current no-arg signature; the
    // invariant under test (never dismiss before a real success) is unchanged.
    expect(SERVICIO_C).not.toMatch(/handleChiudiConferma = async \(\) => \{\s*setChiudiModal\(null\)/);
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
  test('the refusal is detected and normalized to the single submission error', () => {
    expect(SERVICIO_C).toMatch(/isNoOpenServiceSession\(err\)/);
    expect(SERVICIO_C).toMatch(/new Error\("No se pudo confirmar el pedido\."\)/);
    expect(SERVICIO_C).not.toMatch(/NO_OPEN_SERVICE_SESSION_MESAGE/);
  });

  test('order submission never opens or ensures the service by itself', () => {
    expect(SERVICIO_C).not.toMatch(/openServiceSession/);
    expect(SERVICIO_C).not.toMatch(/ensureCurrentServiceSession/);
    expect(code(MODAL)).not.toMatch(/openServiceSession/);
    expect(code(MODAL)).not.toMatch(/ensureCurrentServiceSession/);
  });

  test('the error is rethrown so the EXISTING lifecycle renders it', () => {
    expect(SERVICIO_C).toMatch(/typed\.code = NO_OPEN_SERVICE_SESSION_CODE;\s*throw typed;/);
    expect(code(MODAL)).toMatch(/return onConfirm\(\{/);
    // Mesa slice (V1_STAGING_MESA_ORDER_BUILDER_39): NuevoPedidoModal's onConfirm
    // no longer branches on mesaCommandTarget -- Mesa orders now go through the
    // separate MesaOrderBuilder -> addMesaCommand path entirely, never through
    // this modal, so this callback only ever calls addOrden.
    expect(SERVICIO_C).toMatch(/onConfirm=\{async o=>\{ await addOrden\(o\); \}\}/);
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
    expect(HOOK_C).not.toMatch(/submissionLifecycle|persistenceGateway/);
    expect(FLOW_C).not.toMatch(/submissionLifecycle|persistenceGateway/);
  });

  test('SUCCESS remains the only outcome that clears the form', () => {
    expect(code(MODAL)).toMatch(/if \(submission\.phase !== PHASE\.SUCCESS\) return;\s*reset\(\);/);
  });
});

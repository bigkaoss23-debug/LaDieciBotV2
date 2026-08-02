// ─── Gestión de accesos — owner-only access management (V3-I) ────────────────
// Lists staff access accounts via the accepted Access Management V3 API and now
// (V3-I) also performs the real owner operations against it: create, rename,
// role change, PIN set/clear, deactivate/reactivate, plus the owner's own PIN
// change (via the existing legacy transport — outside the V3 write API's scope).
//
// Gated by canAccessAdminArea(auth.getRole()) at the App.jsx call site, exactly
// like CurrentNightCloseoutPage — a non-owner never mounts this component, so it
// never calls the V3 API either.
//
// Every presentation decision (fallback naming, role wording, status wording/
// tone) is made once in accessUserViewModel.js. Every write decision (step-up,
// idempotency, double-submit) is made once in useAccessOperation.js, used by
// every panel in AccessOperationPanel.jsx. Only ONE operation panel is ever open
// at a time — `activePanel` below is the single source of truth for that.
//
// V3-I UX pass: MI ACCESO / PERSONAL are real tabs (not a flat scroll), every
// person is a bordered card (collapsed header fully clickable, expanded body
// visually distinct), operations are a real 4-button grid (Nombre/Rol/PIN/
// Estado — PIN itself drills into a small Cambiar/Quitar choice so the same
// two underlying operations survive unchanged), and the raw actor id lives
// behind a closed-by-default "Detalles técnicos" disclosure instead of being
// shown as routine information.
import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../../api';
import { C } from '../../constants';
import { listAccessUsers } from '../../accessManagement/accessManagementApi';
import { buildAccessDirectoryViewModel } from '../../accessManagement/accessUserViewModel';
import { ghostBtn } from '../service/OpenServiceConfirmation';
import AccessOperationPanel from './AccessOperationPanel';

function describeLoadError(result) {
  if (!result) return 'No se pudo cargar la lista de accesos.';
  switch (result.kind) {
    case 'unauthenticated':
      return 'Sesión expirada. Vuelve a entrar con el PIN.';
    case 'forbidden':
      return 'Acceso no permitido para este rol.';
    case 'network':
      return 'Error de red. Comprueba la conexión.';
    case 'malformed':
      return 'Respuesta inesperada del servidor.';
    default:
      return 'No se pudo cargar la lista de accesos.';
  }
}

const TONE_COLOR = { danger: C.rosso, warning: C.orange, positive: C.verde };
const toneColor = (tone) => TONE_COLOR[tone] || 'rgba(255,255,255,0.5)';

const button = {
  background: C.fumo, color: C.bianco, border: `1px solid ${C.grigio}`,
  borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontSize: 13,
  fontWeight: 700, minHeight: 44,
};
const orangeButton = { ...button, background: C.orange, border: 'none', color: '#111' };

// A small stylesheet, injected once, for interaction states inline styles
// cannot express (:hover/:focus-visible/:active) and for the responsive
// action grid (auto two columns on phone, one row from tablet width up — no
// JS resize listener needed).
const PAGE_STYLE = `
.access-card-header:hover { background: rgba(255,255,255,0.045); }
.access-card-header:focus-visible { outline: 2px solid ${C.orange}; outline-offset: -2px; }
.access-card-header:active { background: rgba(255,255,255,0.07); }
.access-tab-btn:focus-visible { outline: 2px solid ${C.orange}; outline-offset: 2px; }
.access-grid-btn:focus-visible { outline: 2px solid ${C.orange}; outline-offset: 2px; }
.access-grid-btn:hover:not(:disabled) { background: rgba(255,255,255,0.11); }
.access-grid-btn:active:not(:disabled) { transform: translateY(1px); }
.access-grid-btn-danger:hover:not(:disabled) { background: rgba(232,52,28,0.18); }
.access-tech-toggle:focus-visible { outline: 2px solid ${C.orange}; outline-offset: 2px; }
.access-action-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
@media (min-width: 640px) { .access-action-grid { grid-template-columns: repeat(4, 1fr); } }
`;

// Cards — a shared bordered/background container so both MI ACCESO and
// PERSONAL entries read as distinct controls, not a flat text list.
const card = {
  background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 14, overflow: 'hidden',
};
const cardHeaderStyle = {
  width: '100%', minHeight: 44, background: 'transparent', border: 'none', cursor: 'pointer',
  padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  textAlign: 'left', gap: 10, color: 'inherit',
};
const expandedBody = {
  padding: '2px 16px 16px', background: 'rgba(255,255,255,0.025)',
  borderTop: '1px solid rgba(255,255,255,0.08)',
};
const disclosureArrow = (expanded) => ({
  color: 'rgba(255,255,255,0.55)', fontSize: 16, flexShrink: 0, lineHeight: 1,
  transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s',
});
const techToggleBtn = {
  background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12,
  fontWeight: 600, cursor: 'pointer', padding: '10px 0', minHeight: 32,
};
const gridBtn = {
  display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
  minHeight: 44, padding: '0 12px', borderRadius: 10,
  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.18)',
  color: C.bianco, fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'left',
};
const gridBtnDanger = {
  ...gridBtn, background: 'rgba(232,52,28,0.1)', border: `1px solid ${C.rosso}`, color: '#ffb4b4',
};
const gridBtnCentered = { ...gridBtn, justifyContent: 'center', textAlign: 'center' };
const gridBtnDangerCentered = { ...gridBtnDanger, justifyContent: 'center', textAlign: 'center' };

// ═══ TABS ═════════════════════════════════════════════════════════════════
const TABS = [
  { id: 'miAcceso', label: 'Mi acceso' },
  { id: 'personal', label: 'Personal' },
];

function TabBar({ active, onChange }) {
  const onKeyDown = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const idx = TABS.findIndex((t) => t.id === active);
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    onChange(TABS[(idx + dir + TABS.length) % TABS.length].id);
  };
  return (
    <div
      role="tablist"
      aria-label="Gestión de accesos"
      onKeyDown={onKeyDown}
      style={{ display: 'flex', gap: 6, marginBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.1)' }}
    >
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`access-tab-${t.id}`}
            aria-selected={isActive}
            aria-controls={`access-tabpanel-${t.id}`}
            tabIndex={isActive ? 0 : -1}
            className="access-tab-btn"
            onClick={() => onChange(t.id)}
            data-testid={`access-tab-${t.id}`}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '10px 6px', minHeight: 44, fontSize: 14, fontWeight: 800,
              color: isActive ? C.bianco : 'rgba(255,255,255,0.45)',
              borderBottom: isActive ? `2px solid ${C.orange}` : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// MI ACCESO — one clear owner card: identity, PIN status, one recognizable
// Cambiar PIN button. No role or active-state noise (a logged-in owner is
// definitionally active and its own role word would just repeat the name).
function OwnerRow({ vm, panelOpen, onOpenPanel, onClosePanel }) {
  return (
    <div style={card} data-testid="access-owner-card">
      <div style={{ padding: '16px 16px 18px' }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: C.bianco }}>{vm.primaryLabel}</div>
        {vm.showRoleLabel && (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{vm.roleLabel}</div>
        )}
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, color: toneColor(vm.statusTone) }}>
          {vm.statusLabel}
        </div>
        {!panelOpen ? (
          <button
            type="button"
            onClick={() => onOpenPanel('ownerPin')}
            data-testid="access-owner-change-pin-btn"
            className="access-grid-btn"
            style={{ ...gridBtnCentered, marginTop: 14, width: '100%' }}
          >
            Cambiar PIN
          </button>
        ) : (
          <div style={{ marginTop: 6 }}>
            <AccessOperationPanel operation="ownerPin" onCancel={onClosePanel} onSuccess={() => onOpenPanel('ownerPinDone')} />
          </div>
        )}
      </div>
    </div>
  );
}

// PERSONAL — a distinct card per person. Collapsed header is one clickable
// control (name, role+status line, disclosure chevron). Expanded body has a
// visually separate background and holds the 4-button operation grid, plus a
// closed-by-default "Detalles técnicos" disclosure for the raw actor id.
function StaffRow({ vm, expanded, onToggle, panelOperation, onOpenPanel, onClosePanel, onSuccess }) {
  const [techOpen, setTechOpen] = useState(false);
  useEffect(() => { if (!expanded) setTechOpen(false); }, [expanded]);

  const lifecycleLabel = vm.active ? 'Desactivar acceso' : 'Activar acceso';
  const lifecycleOp = vm.active ? 'deactivate' : 'reactivate';

  return (
    <div style={{ ...card, marginBottom: 10 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        data-testid={`access-row-${vm.actorId}`}
        className="access-card-header"
        style={cardHeaderStyle}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.bianco, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {vm.primaryLabel}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
            {vm.roleLabel}{vm.roleBeta ? ' · Beta' : ''} · <span style={{ color: toneColor(vm.statusTone), fontWeight: 600 }}>{vm.statusLabel}</span>
          </div>
        </div>
        <span aria-hidden="true" style={disclosureArrow(expanded)}>⌄</span>
      </button>
      {expanded && (
        <div style={expandedBody}>
          {!panelOperation ? (
            <>
              <div className="access-action-grid">
                <button type="button" className="access-grid-btn" style={gridBtn}
                  onClick={() => onOpenPanel('rename')} data-testid={`access-action-${vm.actorId}-nombre`}>
                  Nombre
                </button>
                <button type="button" className="access-grid-btn" style={gridBtn}
                  onClick={() => onOpenPanel('role')} data-testid={`access-action-${vm.actorId}-rol`}>
                  Rol
                </button>
                <button type="button" className="access-grid-btn" style={gridBtn}
                  onClick={() => onOpenPanel('pinMenu')} data-testid={`access-action-${vm.actorId}-pin`}>
                  PIN
                </button>
                <button type="button" className="access-grid-btn access-grid-btn-danger" style={gridBtnDanger}
                  onClick={() => onOpenPanel(lifecycleOp)} data-testid={`access-action-${vm.actorId}-estado`}>
                  {lifecycleLabel}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setTechOpen((v) => !v)}
                aria-expanded={techOpen}
                className="access-tech-toggle"
                style={{ ...techToggleBtn, marginTop: 10 }}
                data-testid={`access-tech-toggle-${vm.actorId}`}
              >
                {techOpen ? '▴ Ocultar detalles técnicos' : '▾ Detalles técnicos'}
              </button>
              {techOpen && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.32)' }} data-testid={`access-row-detail-${vm.actorId}`}>
                  ID interno: {vm.secondaryTechnicalId}
                </div>
              )}
            </>
          ) : panelOperation === 'pinMenu' ? (
            <PinChoice vm={vm} onChoose={onOpenPanel} onCancel={onClosePanel} />
          ) : (
            <AccessOperationPanel operation={panelOperation} targetVm={vm} onCancel={onClosePanel} onSuccess={onSuccess} />
          )}
        </div>
      )}
    </div>
  );
}

// The PIN grid cell's small first step: Cambiar/Configurar PIN and (only
// when one is already set) Quitar PIN. Choosing either just opens the SAME
// 'pin'/'clearPin' operation the dispatcher already knows — no new write
// path, only a friendlier entry point into it.
function PinChoice({ vm, onChoose, onCancel }) {
  return (
    <div data-testid={`access-pin-menu-${vm.actorId}`}>
      <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginBottom: 10 }}>{vm.statusLabel}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button type="button" className="access-grid-btn" style={gridBtnCentered}
          onClick={() => onChoose('pin')} data-testid={`access-pin-menu-${vm.actorId}-change`}>
          {vm.hasPin ? 'Cambiar PIN' : 'Configurar PIN'}
        </button>
        {vm.hasPin && (
          <button type="button" className="access-grid-btn access-grid-btn-danger" style={gridBtnDangerCentered}
            onClick={() => onChoose('clearPin')} data-testid={`access-pin-menu-${vm.actorId}-clear`}>
            Quitar PIN
          </button>
        )}
        <button type="button" onClick={onCancel} style={{ ...ghostBtn, padding: '10px 18px', fontSize: 13 }}
          data-testid={`access-pin-menu-${vm.actorId}-cancel`}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default function AccessManagementPage({ onBack, onLogout }) {
  const [phase, setPhase] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [users, setUsers] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [expandedActor, setExpandedActor] = useState(null);
  // { actorId: string | null, operation: string } | null — actorId is null for
  // 'create' (no target yet); the single source of truth enforcing "only one
  // operation panel open at a time" across the whole page.
  const [activePanel, setActivePanel] = useState(null);
  const [activeTab, setActiveTab] = useState('miAcceso');
  const inFlightRef = useRef(false);
  const liveRef = useRef(true);

  const load = useCallback(async ({ isRefresh } = {}) => {
    if (inFlightRef.current) return; // prevent duplicate concurrent refresh requests
    inFlightRef.current = true;
    if (isRefresh) { setRefreshing(true); setRefreshError(''); }
    const result = await listAccessUsers();
    inFlightRef.current = false;
    if (!liveRef.current) return;
    if (result.kind === 'ok') {
      setUsers(result.users);
      setPhase('ready');
      setLoadError(null);
      if (isRefresh) setRefreshing(false);
      return;
    }
    if (isRefresh) {
      // A failed background refresh never destroys the last known-good list.
      setRefreshing(false);
      setRefreshError(describeLoadError(result));
      return;
    }
    setPhase('error');
    setLoadError(result);
  }, []);

  useEffect(() => {
    liveRef.current = true;
    load();
    return () => { liveRef.current = false; };
  }, [load]);

  const directory = users
    ? buildAccessDirectoryViewModel(users, { currentActorId: auth.getActor() })
    : { owner: null, staff: [] };

  const openStaffPanel = (actorId, operation) => {
    setExpandedActor(actorId); // opening an action always keeps its row expanded
    setActivePanel({ actorId, operation });
  };
  const closePanel = () => setActivePanel(null);

  const onStaffOperationSuccess = useCallback(async (writtenUser) => {
    setActivePanel(null);
    await load({ isRefresh: true });
    if (writtenUser && writtenUser.actor) setExpandedActor(writtenUser.actor);
  }, [load]);

  const onOwnerPinResult = (marker) => {
    if (marker === 'ownerPinDone') {
      // Session_version just bumped server-side — the current token is no longer
      // valid; the canonical operational logout (App.jsx) returns to the PIN
      // screen, exactly like OperationalMenu's own owner-self-PIN-change flow.
      setActivePanel(null);
      if (typeof onLogout === 'function') onLogout();
    }
  };

  const creating = !!(activePanel && activePanel.actorId === null && activePanel.operation === 'create');

  return (
    <main style={{ minHeight: '100vh', background: C.nero, color: C.bianco, padding: 20, fontFamily: "'Satoshi',-apple-system,sans-serif" }}>
      <style>{PAGE_STYLE}</style>
      <button type="button" onClick={onBack} data-testid="access-back-btn" style={button}>← Menú principal</button>

      <section style={{ maxWidth: 640, margin: '24px auto 60px' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3 }}>Gestión de accesos</h1>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 3 }}>
              Quién tiene acceso a la aplicación.
            </p>
          </div>
          <button
            type="button"
            onClick={() => load({ isRefresh: true })}
            disabled={refreshing || phase === 'loading'}
            aria-label="Actualizar lista de accesos"
            data-testid="access-refresh-btn"
            style={{ ...button, opacity: refreshing ? 0.6 : 1, cursor: refreshing ? 'default' : 'pointer' }}
          >
            {refreshing ? 'Actualizando…' : '↻ Actualizar'}
          </button>
        </header>

        {refreshError && (
          <div role="alert" data-testid="access-refresh-error" style={{
            background: 'rgba(232,52,28,0.12)', border: `1px solid ${C.rosso}`, borderRadius: 12,
            padding: '10px 14px', marginBottom: 18, color: '#ffb4b4', fontSize: 13,
          }}>
            {refreshError}
          </div>
        )}

        {phase === 'loading' && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'rgba(255,255,255,0.35)' }} aria-live="polite">
            <div style={{ fontSize: 36, marginBottom: 12, animation: 'pulse 1.5s infinite' }}>🔐</div>
            <div style={{ fontSize: 14 }}>Cargando accesos…</div>
          </div>
        )}

        {phase === 'error' && (
          <div role="alert" data-testid="access-load-error" style={{
            background: 'rgba(232,52,28,0.1)', border: `1px solid ${C.rosso}`, borderRadius: 14,
            padding: '20px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          }}>
            <div style={{ fontSize: 22 }}>⚠</div>
            <div style={{ color: '#ffb4b4', fontWeight: 700, fontSize: 13, flex: 1, minWidth: 180 }}>
              {describeLoadError(loadError)}
            </div>
            <button type="button" onClick={() => load()} data-testid="access-retry-btn" style={orangeButton}>
              ↻ Reintentar
            </button>
          </div>
        )}

        {phase === 'ready' && users && users.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.4)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👤</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No hay accesos para mostrar</div>
            <div style={{ fontSize: 13 }}>Todavía no hay cuentas de acceso registradas.</div>
          </div>
        )}

        {phase === 'ready' && users && users.length > 0 && (
          <>
            <TabBar active={activeTab} onChange={setActiveTab} />

            <div
              role="tabpanel"
              id="access-tabpanel-miAcceso"
              aria-labelledby="access-tab-miAcceso"
              hidden={activeTab !== 'miAcceso'}
              data-testid="access-tabpanel-miAcceso"
            >
              {directory.owner ? (
                <OwnerRow
                  vm={directory.owner}
                  panelOpen={activePanel && activePanel.operation === 'ownerPin'}
                  onOpenPanel={(op) => (op === 'ownerPinDone' ? onOwnerPinResult(op) : setActivePanel({ actorId: directory.owner.actorId, operation: op }))}
                  onClosePanel={closePanel}
                />
              ) : (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                  No se encontró tu propio registro en la lista.
                </p>
              )}
            </div>

            <div
              role="tabpanel"
              id="access-tabpanel-personal"
              aria-labelledby="access-tab-personal"
              hidden={activeTab !== 'personal'}
              data-testid="access-tabpanel-personal"
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
                <div>
                  <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Personal</h2>
                  {directory.staff.length > 0 && (
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>
                      {directory.staff.length} {directory.staff.length === 1 ? 'persona' : 'personas'}
                    </p>
                  )}
                </div>
                {!creating && (
                  <button
                    type="button"
                    onClick={() => setActivePanel({ actorId: null, operation: 'create' })}
                    data-testid="access-create-btn"
                    style={orangeButton}
                  >
                    + Añadir acceso
                  </button>
                )}
              </div>

              {creating && (
                <div style={{ ...card, padding: '4px 16px 16px', marginBottom: 16 }}>
                  <AccessOperationPanel operation="create" onCancel={closePanel} onSuccess={onStaffOperationSuccess} />
                </div>
              )}

              {directory.staff.length === 0 ? (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                  No hay más cuentas de acceso además de la tuya.
                </p>
              ) : (
                <div>
                  {directory.staff.map((vm) => (
                    <StaffRow
                      key={vm.actorId}
                      vm={vm}
                      expanded={expandedActor === vm.actorId}
                      onToggle={() => {
                        setExpandedActor((prev) => (prev === vm.actorId ? null : vm.actorId));
                        if (activePanel && activePanel.actorId === vm.actorId) setActivePanel(null);
                      }}
                      panelOperation={activePanel && activePanel.actorId === vm.actorId ? activePanel.operation : null}
                      onOpenPanel={(op) => openStaffPanel(vm.actorId, op)}
                      onClosePanel={closePanel}
                      onSuccess={onStaffOperationSuccess}
                    />
                  ))}
                </div>
              )}
            </div>

            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 26, textAlign: 'center' }}>
              La gestión avanzada de permisos estará disponible próximamente.
            </p>
          </>
        )}
      </section>
    </main>
  );
}

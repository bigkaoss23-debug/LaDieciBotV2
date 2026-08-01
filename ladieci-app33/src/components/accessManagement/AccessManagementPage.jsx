// ─── Gestión de accesos — owner-only READ-ONLY view (V3-I.1) ─────────────────
// Lists the current staff access accounts via the accepted Access Management V3
// API (GET /api/auth/v3/access-users). STRICTLY READ-ONLY: no create, rename,
// role-change, PIN, or activation controls. Those arrive in a later, separate
// slice (V3-I.2/V3-I.3) — this screen only explains that they are coming.
//
// Gated by canAccessAdminArea(auth.getRole()) at the App.jsx call site, exactly
// like CurrentNightCloseoutPage — a non-owner never mounts this component, so it
// never calls the V3 API either.
//
// V3-I.1 UX pass: every presentation decision (fallback naming, role wording,
// status wording/tone) is made once in accessUserViewModel.js — this component
// only renders the resulting strings. Restaurant-facing list, not an admin
// dashboard: plain rows with a single divider, no chip grid, no card grid.
import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../../api';
import { C } from '../../constants';
import { listAccessUsers } from '../../accessManagement/accessManagementApi';
import { buildAccessDirectoryViewModel } from '../../accessManagement/accessUserViewModel';

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

// MI ACCESO — a single lightweight identity block, same weight as the
// OperationalMenu identity header (name + one muted line), not a bordered card.
function OwnerRow({ vm }) {
  return (
    <div style={{ padding: '4px 2px 18px', borderBottom: `1px solid ${C.fumo}`, marginBottom: 18 }} data-testid="access-owner-row">
      <div style={{ fontSize: 17, fontWeight: 800, color: C.bianco }}>{vm.primaryLabel}</div>
      {vm.showRoleLabel && (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{vm.roleLabel}</div>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, color: toneColor(vm.statusTone) }}>
        {vm.statusLabel}
      </div>
      {/* Structurally ready for a real action in a later write-enabled slice — plain
          non-interactive text, never an enabled button, per V3-I.1 scope. */}
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 10 }}>
        Cambiar PIN · próximamente
      </div>
    </div>
  );
}

// PERSONAL — one plain row per person, divider only (no card border/shadow), a
// single combined role+status text line, expandable on tap for the one piece of
// safe secondary detail (the internal id, for support use) that's genuinely
// useful but must never be primary text. The role text is deliberately plain —
// this is the exact spot a later write-slice replaces with a real role selector.
function StaffRow({ vm, expanded, onToggle }) {
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        data-testid={`access-row-${vm.actorId}`}
        style={{
          width: '100%', minHeight: 44, background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '12px 2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          textAlign: 'left', gap: 10, color: 'inherit',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.bianco, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {vm.primaryLabel}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
            {vm.roleLabel}{vm.roleBeta ? ' · Beta' : ''} · <span style={{ color: toneColor(vm.statusTone), fontWeight: 600 }}>{vm.statusLabel}</span>
          </div>
        </div>
        <span aria-hidden="true" style={{
          color: 'rgba(255,255,255,0.3)', fontSize: 13, flexShrink: 0,
          transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s',
        }}>
          ⌄
        </span>
      </button>
      {expanded && (
        <div style={{ padding: '0 2px 14px', fontSize: 12, color: 'rgba(255,255,255,0.32)' }} data-testid={`access-row-detail-${vm.actorId}`}>
          ID interno: {vm.secondaryTechnicalId}
        </div>
      )}
    </div>
  );
}

export default function AccessManagementPage({ onBack }) {
  const [phase, setPhase] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [users, setUsers] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [expandedActor, setExpandedActor] = useState(null);
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

  return (
    <main style={{ minHeight: '100vh', background: C.nero, color: C.bianco, padding: 20, fontFamily: "'Satoshi',-apple-system,sans-serif" }}>
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
            {directory.owner ? (
              <OwnerRow vm={directory.owner} />
            ) : (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 18 }}>
                No se encontró tu propio registro en la lista.
              </p>
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
                    onToggle={() => setExpandedActor((prev) => (prev === vm.actorId ? null : vm.actorId))}
                  />
                ))}
              </div>
            )}

            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 26, textAlign: 'center' }}>
              La edición de nombres, roles y PIN estará disponible próximamente.
            </p>
          </>
        )}
      </section>
    </main>
  );
}

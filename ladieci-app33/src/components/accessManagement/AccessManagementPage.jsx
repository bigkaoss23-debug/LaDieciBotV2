// ─── Gestión de accesos — owner-only READ-ONLY view (V3-I.1) ─────────────────
// Lists the current staff access accounts via the accepted Access Management V3
// API (GET /api/auth/v3/access-users). STRICTLY READ-ONLY: no create, rename,
// role-change, PIN, or activation controls. Those arrive in a later, separate
// slice (V3-I.2/V3-I.3) — this screen only explains that they are coming.
//
// Gated by canAccessAdminArea(auth.getRole()) at the App.jsx call site, exactly
// like CurrentNightCloseoutPage — a non-owner never mounts this component, so it
// never calls the V3 API either.
import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../../api';
import { C, useWidth } from '../../constants';
import Chip from '../ui/Chip';
import { listAccessUsers } from '../../accessManagement/accessManagementApi';
import { describeRole } from '../../accessManagement/roleLabels';

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

function StatusChip({ active }) {
  return active
    ? <Chip label="● Activo" color={C.verde} sm />
    : <Chip label="○ Inactivo" color={C.grigio} sm />;
}

function PinChip({ hasPin }) {
  return hasPin
    ? <Chip label="PIN configurado" color={C.blu} sm />
    : <Chip label="PIN no configurado" color={C.orange} sm />;
}

function RoleChip({ canonicalRole }) {
  const { label, beta, legacy } = describeRole(canonicalRole);
  return (
    <>
      <Chip label={label} color={C.viola} sm />
      {legacy && <Chip label="Legacy" color={C.grigio} sm />}
      {beta && <Chip label="Beta · En desarrollo" color={C.orange} sm />}
    </>
  );
}

const cardStyle = {
  background: C.carbone2,
  border: `1px solid ${C.fumo}`,
  borderRadius: 16,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  minWidth: 0,
};

function UserCard({ user, secondaryLabel }) {
  return (
    <div style={cardStyle} data-testid={`access-card-${user.actor}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <strong style={{ color: C.bianco, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.displayName || user.actor}
        </strong>
        {secondaryLabel && (
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, letterSpacing: 0.3 }}>{secondaryLabel}</span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <RoleChip canonicalRole={user.canonicalRole} />
        <StatusChip active={user.active} />
        <PinChip hasPin={user.hasPin} />
      </div>
    </div>
  );
}

const button = {
  background: C.fumo, color: C.bianco, border: `1px solid ${C.grigio}`,
  borderRadius: 10, padding: '12px 16px', cursor: 'pointer', fontSize: 14,
  fontWeight: 700, minHeight: 44,
};
const orangeButton = { ...button, background: C.orange, border: 'none', color: '#111' };

export default function AccessManagementPage({ onBack }) {
  const width = useWidth();
  const cols = width >= 680 ? 3 : width >= 420 ? 2 : 1;

  const [phase, setPhase] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [users, setUsers] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
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

  const myActor = auth.getActor();
  const me = users ? users.find((u) => u.actor === myActor) : null;
  const others = users ? users.filter((u) => u.actor !== myActor) : [];

  return (
    <main style={{ minHeight: '100vh', background: C.nero, color: C.bianco, padding: 20, fontFamily: "'Satoshi',-apple-system,sans-serif" }}>
      <button type="button" onClick={onBack} data-testid="access-back-btn" style={button}>← Menú principal</button>

      <section style={{ maxWidth: 980, margin: '24px auto 60px' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3 }}>Gestión de accesos</h1>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 6, maxWidth: 520 }}>
              Aquí puedes ver quién tiene acceso a la aplicación del restaurante y con qué rol.
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
            <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 12 }}>
              Mi acceso
            </h2>
            {me ? (
              <div style={{ marginBottom: 32 }}>
                <UserCard user={me} />
              </div>
            ) : (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 32 }}>
                No se encontró tu propio registro en la lista.
              </p>
            )}

            <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 12 }}>
              Personal
            </h2>
            {others.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 32 }}>
                No hay más cuentas de acceso además de la tuya.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gap: 12, marginBottom: 32 }}>
                {others.map((u) => (
                  <UserCard key={u.actor} user={u} secondaryLabel={u.actor} />
                ))}
              </div>
            )}

            <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 12 }}>
              En desarrollo
            </h2>
            <div style={{
              background: C.carbone2, border: `1px solid ${C.fumo}`, borderRadius: 14,
              padding: 18, color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 1.7,
            }}>
              <strong style={{ color: C.orange }}>Próximamente:</strong> crear nuevos accesos, cambiar el nombre o el
              rol de un miembro del equipo, gestionar su PIN y activar o desactivar cuentas. Estas acciones
              llegarán en una próxima actualización controlada.
            </div>
          </>
        )}
      </section>
    </main>
  );
}

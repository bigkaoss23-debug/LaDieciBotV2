// ===============================================================
// IncidenciasPage.jsx — SERVICE CLOSEOUT V2 / SLICE 4B
//
// Admin-only, READ-ONLY backlog/history of closeout incidents. Consumes the
// backend action getServiceIncidents (unconditionally admin-verified
// regardless of AUTH_V2_LEGACY_GUARD_ENABLED — backend Slice 4A.1) via the
// SAME proxy API client every other admin read uses.
//
// Absolutely no resolve/acknowledge/defer/write-off/reversal/delete control
// exists here or anywhere in this file — every button is navigation/filter/
// retry only. See serviceIncidentsAdmin.static.test.js for the source-level
// proof that stays true.
// ===============================================================

import { useState, useCallback, useEffect } from 'react';
import { C } from '../constants';
import { api } from '../api';
import {
  describeIncidentType, describeCategory, describeResolutionStatus,
  describeFinancialExposure,
} from '../utils/incidentDisplay';

const ESTADO_OPTIONS = [
  // 'Pendientes' omits resolutionStatus entirely — the backend's OWN default
  // is pending,acknowledged; not re-declared here so the two can never drift.
  { id: 'pendientes', label: 'Pendientes', resolutionStatus: null },
  { id: 'historial', label: 'Historial', resolutionStatus: 'resolved,superseded' },
  { id: 'todas', label: 'Todas', resolutionStatus: 'pending,acknowledged,resolved,superseded' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'operational', label: 'Operativa' },
  { value: 'financial', label: 'Financiera' },
  { value: 'informational', label: 'Informativa' },
  { value: 'integrity,security', label: 'Integridad / Seguridad' },
];

const STATUS_COLOR = Object.freeze({
  pending: C.orange,
  acknowledged: C.blu,
  resolved: C.verde,
  superseded: C.grigio,
});

const CATEGORY_COLOR = Object.freeze({
  operational: C.blu,
  financial: C.orange,
  informational: C.grigio,
  integrity: C.viola,
  security: C.viola,
});

function errorMessage(res) {
  const status = res && res._status;
  const code = res && res.error ? String(res.error) : '';
  if (status === 401) return 'Sesión expirada o no autorizada. Vuelve a entrar con el PIN.';
  if (status === 403 || code === 'ROLE_FORBIDDEN') return 'Acceso no permitido para este rol.';
  if (status === 0) return 'Error de red. Comprueba la conexión.';
  return 'No se pudo cargar la lista de incidencias' + (code ? ` (${code})` : '') + '.';
}

function formatDetectedAt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function IncidentCard({ incident }) {
  const statusColor = STATUS_COLOR[incident.resolution_status] || C.grigio;
  const categoryColor = CATEGORY_COLOR[incident.category] || C.grigio;
  const exposureText = describeFinancialExposure(incident);
  return (
    <div style={card} data-testid="incident-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{describeIncidentType(incident.incident_type)}</div>
        <span style={{
          fontSize: 11, fontWeight: 800, letterSpacing: 0.3, color: statusColor,
          background: statusColor + '1A', border: `1px solid ${statusColor}55`,
          borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap',
        }}>
          {describeResolutionStatus(incident.resolution_status)}
        </span>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
        {incident.business_date || '—'} · {incident.service_kind || '—'}
        {' · '}
        <span style={{ color: categoryColor }}>{describeCategory(incident.category)}</span>
        {incident.severity === 'critical' && (
          <span style={{ marginLeft: 8, color: C.rosso, fontWeight: 800 }}>CRÍTICA</span>
        )}
      </div>
      {exposureText && (
        <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: C.orange }}>{exposureText}</div>
      )}
      {incident.order_id && (
        <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Pedido: {incident.order_id}</div>
      )}
      <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
        Detectada: {formatDetectedAt(incident.detected_at)}
        {incident.attempt_status ? ` · intento: ${incident.attempt_status}` : ''}
      </div>
      {/* Technical/audit detail — de-emphasized, never the primary read. */}
      <details style={{ marginTop: 8 }}>
        <summary style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}>Detalles técnicos</summary>
        <div style={{ marginTop: 6, fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', wordBreak: 'break-all' }}>
          <div>incident: {incident.id}</div>
          <div>attempt: {incident.closeout_correlation_id}</div>
          {incident.snapshot_id && <div>snapshot: {incident.snapshot_id}</div>}
        </div>
      </details>
    </div>
  );
}

export default function IncidenciasPage({ onBack }) {
  const [estado, setEstado] = useState('pendientes');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState(null);

  const load = useCallback(async (estadoId, categoryValue, dateValue) => {
    setLoading(true);
    setError('');
    const opt = ESTADO_OPTIONS.find((o) => o.id === estadoId) || ESTADO_OPTIONS[0];
    const filters = {};
    if (opt.resolutionStatus) filters.resolutionStatus = opt.resolutionStatus;
    if (categoryValue) filters.category = categoryValue;
    if (dateValue) filters.businessDate = dateValue;
    const res = await api.getServiceIncidents(filters);
    if (Array.isArray(res)) {
      setRows(res);
    } else {
      setRows(null);
      setError(errorMessage(res));
    }
    setLoading(false);
  }, []);

  // Carga inicial: Pendientes, sin filtros — el default accionable del backend.
  useEffect(() => { load('pendientes', '', ''); /* eslint-disable-next-line */ }, []);

  const onEstadoChange = (id) => { setEstado(id); load(id, category, date); };
  const onCategoryChange = (e) => { const v = e.target.value; setCategory(v); load(estado, v, date); };

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          {onBack && (
            <button onClick={onBack} data-testid="incidencias-back-btn" style={backButton}>← Volver</button>
          )}
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3 }}>Incidencias</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
              Cierre de servicio · auditoría · solo lectura
            </div>
          </div>
          <span style={{
            marginLeft: 'auto', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: C.verde,
            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: '5px 10px',
          }}>
            🔒 Solo lectura
          </span>
        </div>

        {/* ── Filtros ── */}
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {ESTADO_OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => onEstadoChange(o.id)}
                data-testid={`incidencias-estado-${o.id}`}
                style={{
                  ...pillButton,
                  background: estado === o.id ? 'rgba(249,115,22,0.16)' : 'rgba(255,255,255,0.05)',
                  color: estado === o.id ? C.orange : 'rgba(255,255,255,0.6)',
                  border: `1px solid ${estado === o.id ? 'rgba(249,115,22,0.4)' : 'rgba(255,255,255,0.1)'}`,
                }}
              >
                {o.label}
              </button>
            ))}
          </div>

          <select
            value={category}
            onChange={onCategoryChange}
            data-testid="incidencias-category-select"
            style={selectStyle}
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>{o.label}</option>
            ))}
          </select>

          <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginLeft: 'auto' }}>Fecha</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            data-testid="incidencias-date-input"
            style={dateInput}
          />
          <button
            onClick={() => load(estado, category, date)}
            disabled={loading}
            data-testid="incidencias-load-btn"
            style={{ ...pillButton, background: loading ? 'rgba(255,255,255,0.05)' : 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.35)', color: loading ? 'rgba(255,255,255,0.3)' : C.blu }}
          >
            {loading ? 'Cargando…' : '↻ Cargar'}
          </button>
        </div>

        {/* ── Estado de carga / error / vacío ── */}
        {loading && !rows && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Cargando…</p>}
        {error && (
          <div style={{ ...card, border: '1px solid rgba(232,52,28,0.35)', background: 'rgba(232,52,28,0.08)', color: '#ffb4a8' }} role="alert" data-testid="incidencias-error">
            {error}
          </div>
        )}
        {!loading && !error && rows && rows.length === 0 && (
          <div style={{ ...card, textAlign: 'center', color: 'rgba(255,255,255,0.5)' }} data-testid="incidencias-empty">
            No hay incidencias pendientes.
          </div>
        )}

        {/* ── Lista (cards — legible en móvil y escritorio) ── */}
        {!error && rows && rows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((incident) => <IncidentCard key={incident.id} incident={incident} />)}
          </div>
        )}
      </div>
    </div>
  );
}

const wrap = { minHeight: '100vh', background: C.nero, color: C.bianco, fontFamily: "'DM Sans',sans-serif", padding: '20px 18px 60px' };
const card = { background: C.carbone, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 18px' };
const backButton = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'rgba(255,255,255,0.5)', padding: '8px 14px', cursor: 'pointer', fontSize: 13 };
const pillButton = { borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700 };
const selectStyle = { background: C.fumo, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: C.bianco, padding: '8px 10px', fontSize: 13 };
const dateInput = { background: C.fumo, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: C.bianco, padding: '8px 10px', fontSize: 14 };

// ─── Gestión de accesos — write-operation panels (V3-I) ──────────────────────
// One dispatcher (AccessOperationPanel) renders the ONE currently-open operation
// for the ONE currently-open row (see AccessManagementPage's `activePanel`
// singleton state — enforces "only one operation panel open at a time"). Every
// panel drives its write through the SAME useAccessOperation() controller: one
// confirmation → owner step-up (reusing the canonical OwnerStepUpView, the exact
// same proof the admin-PIN flow already uses) → submit → success/error. No panel
// builds its own step-up UI, its own idempotency key, or its own double-submit
// guard — all of that lives once, in the hook.
import { useState } from 'react';
import { C } from '../../constants';
import { api } from '../../api';
import OwnerStepUpView from '../ownerStepUp/OwnerStepUpView';
import PinPad from '../ui/PinPad';
import { useAccessOperation } from '../../accessManagement/useAccessOperation';
import {
  createAccessUser, renameAccessUser, changeAccessUserRole,
  setAccessUserPin, clearAccessUserPin, deactivateAccessUser, reactivateAccessUser,
} from '../../accessManagement/accessManagementApi';
import { ROLE_OPTIONS, describeRole } from '../../accessManagement/roleLabels';
import { PIN_LENGTH, resolvePinInput, pinInputMessage, PIN_MISMATCH_MESSAGE } from '../../account/accountHelpers';
import { primaryBtn, ghostBtn } from '../service/OpenServiceConfirmation';

// Reused verbatim from OperationalMenu.jsx's ManageActorsView — the established
// labeled-text-field style for this app's dark UI (not AccountApp.jsx's, which
// belongs to a visually distinct customer-facing surface).
const inputStyle = {
  width: '100%', height: 48, borderRadius: 10, textAlign: 'left',
  fontSize: 15, fontWeight: 600, appearance: 'none',
  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
  color: '#fff', marginBottom: 10,
};
const labelStyle = { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginBottom: 6, textAlign: 'left' };

const panelShell = { marginTop: 10, padding: '4px 2px 14px' };

function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div role="alert" style={{
      background: 'rgba(232,52,28,0.12)', border: `1px solid ${C.rosso}`, borderRadius: 10,
      padding: '9px 12px', marginBottom: 12, color: '#ffb4b4', fontSize: 13,
    }}>
      {message}
    </div>
  );
}

// `busy` drives the "Guardando…" label and disables Cancelar (an in-flight
// submit can't be cancelled mid-request); `disabled` (defaults to `busy`)
// controls only the confirm button, so a caller can grey it out for an
// incomplete form WITHOUT falsely claiming a save is already in progress.
function ActionRow({ children, onConfirm, onCancel, busy, disabled, confirmLabel = 'Confirmar' }) {
  const confirmDisabled = disabled !== undefined ? disabled : busy;
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
      <button type="button" onClick={onConfirm} disabled={confirmDisabled}
        style={{ ...primaryBtn, opacity: confirmDisabled ? 0.55 : 1, cursor: confirmDisabled ? 'default' : 'pointer', padding: '11px 18px', fontSize: 14 }}>
        {busy ? 'Guardando…' : (children || confirmLabel)}
      </button>
      <button type="button" onClick={onCancel} disabled={busy}
        style={{ ...ghostBtn, opacity: busy ? 0.55 : 1, padding: '10px 18px', fontSize: 13 }}>
        Cancelar
      </button>
    </div>
  );
}

// Every panel funnels its network attempt through this — if step-up is needed,
// it takes over the panel's body until verified, then automatically resumes the
// pending write (no second tap needed).
function StepUpGate({ op, onCancel, children }) {
  if (op.phase === 'awaitingStepUp') {
    return (
      <OwnerStepUpView
        onCancel={onCancel}
        onVerified={op.retryAfterStepUp}
        onReauthRequired={onCancel}
      />
    );
  }
  return children;
}

// ═══ CREATE ═══════════════════════════════════════════════════════════════
export function CreateAccessForm({ onCancel, onSuccess }) {
  const op = useAccessOperation((result) => onSuccess(result.user));
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('');
  const [confirming, setConfirming] = useState(false);

  const trimmedName = displayName.trim();
  const canContinue = trimmedName.length > 0 && !!role;
  const roleLabel = role ? describeRole(role).label : '';

  const submit = () => {
    op.run((stepUpProof, clientRequestId) =>
      createAccessUser({ displayName: trimmedName, role, stepUpProof, clientRequestId })
    );
  };

  return (
    <div style={panelShell} data-testid="panel-create">
      <StepUpGate op={op} onCancel={onCancel}>
        <ErrorBanner message={op.phase === 'error' ? op.errorMessage : ''} />
        {!confirming ? (
          <>
            <div style={labelStyle}>Nombre</div>
            <input
              type="text" value={displayName} maxLength={120}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Nombre de la persona" style={inputStyle}
              data-testid="create-name-input"
            />
            <div style={{ ...labelStyle, marginTop: 4 }}>Rol</div>
            <div>
              {ROLE_OPTIONS.map((r) => (
                <button key={r.value} type="button" onClick={() => setRole(r.value)}
                  data-testid={`create-role-${r.value}`}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '10px 4px',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: role === r.value ? C.bianco : 'rgba(255,255,255,0.7)',
                    fontSize: 13, fontWeight: role === r.value ? 800 : 600,
                  }}>
                  {role === r.value ? '● ' : ''}{r.label}{r.beta ? ' · Beta' : ''}
                </button>
              ))}
            </div>
            <ActionRow onConfirm={() => canContinue && setConfirming(true)} onCancel={onCancel} busy={false}>
              Continuar
            </ActionRow>
          </>
        ) : (
          <>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 1.6 }}>
              Crear acceso para <strong>{trimmedName}</strong> como <strong>{roleLabel}</strong>.
              No tendrá PIN configurado todavía.
            </p>
            <ActionRow onConfirm={submit} onCancel={() => setConfirming(false)} busy={op.busy}>
              Crear acceso
            </ActionRow>
          </>
        )}
      </StepUpGate>
    </div>
  );
}

// ═══ RENAME ═══════════════════════════════════════════════════════════════
export function RenameForm({ targetVm, onCancel, onSuccess }) {
  const op = useAccessOperation((result) => onSuccess(result.user));
  // Never pre-fill a fallback label (e.g. "Operador 1") as though it were a real
  // stored name — only a genuinely human displayName is offered as a starting
  // point; a fallback name starts the field empty, requiring explicit input.
  const [displayName, setDisplayName] = useState(targetVm.primaryLabel.startsWith('Operador ') ? '' : targetVm.primaryLabel);
  const trimmedName = displayName.trim();

  const submit = () => {
    op.run((stepUpProof, clientRequestId) =>
      renameAccessUser({ actor: targetVm.actorId, displayName: trimmedName, stepUpProof, clientRequestId })
    );
  };

  return (
    <div style={panelShell} data-testid="panel-rename">
      <StepUpGate op={op} onCancel={onCancel}>
        <ErrorBanner message={op.phase === 'error' ? op.errorMessage : ''} />
        <div style={labelStyle}>Nombre</div>
        <input
          type="text" value={displayName} maxLength={120}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Nombre de la persona" style={inputStyle}
          data-testid="rename-name-input"
        />
        <ActionRow onConfirm={submit} onCancel={onCancel} busy={op.busy} disabled={op.busy || !trimmedName}>
          Guardar
        </ActionRow>
      </StepUpGate>
    </div>
  );
}

// ═══ ROLE CHANGE ══════════════════════════════════════════════════════════
export function RoleForm({ targetVm, onCancel, onSuccess }) {
  const op = useAccessOperation((result) => onSuccess(result.user));
  const [selected, setSelected] = useState(null);

  const submit = () => {
    op.run((stepUpProof, clientRequestId) =>
      changeAccessUserRole({
        actor: targetVm.actorId,
        expectedRole: targetVm.writeSnapshot.dbRole,
        requestedRole: selected,
        stepUpProof, clientRequestId,
      })
    );
  };

  return (
    <div style={panelShell} data-testid="panel-role">
      <StepUpGate op={op} onCancel={onCancel}>
        <ErrorBanner message={op.phase === 'error' ? op.errorMessage : ''} />
        {!selected ? (
          <div>
            {ROLE_OPTIONS.map((r) => (
              <button key={r.value} type="button" onClick={() => setSelected(r.value)}
                data-testid={`role-option-${r.value}`}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '10px 4px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: r.value === targetVm.writeSnapshot.dbRole ? C.bianco : 'rgba(255,255,255,0.7)',
                  fontSize: 13, fontWeight: r.value === targetVm.writeSnapshot.dbRole ? 800 : 600,
                }}>
                {r.value === targetVm.writeSnapshot.dbRole ? '● ' : ''}{r.label}{r.beta ? ' · Beta' : ''}
              </button>
            ))}
            <button type="button" onClick={onCancel}
              style={{ ...ghostBtn, marginTop: 14, padding: '10px 18px', fontSize: 13 }}>
              Cancelar
            </button>
          </div>
        ) : (
          <>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 1.6 }}>
              Cambiar el rol de <strong>{targetVm.primaryLabel}</strong> a <strong>{describeRole(selected).label}</strong>.
            </p>
            <ActionRow onConfirm={submit} onCancel={() => setSelected(null)} busy={op.busy}>
              Confirmar
            </ActionRow>
          </>
        )}
      </StepUpGate>
    </div>
  );
}

// ═══ PIN SET (configure/change) ══════════════════════════════════════════
export function PinSetForm({ targetVm, onCancel, onSuccess }) {
  const [newPin, setNewPin] = useState('');
  const [draft, setDraft] = useState('');
  const op = useAccessOperation((result) => { setNewPin(''); setDraft(''); onSuccess(result.user); });
  const [step, setStep] = useState('new'); // 'new' | 'confirm'
  const [validationError, setValidationError] = useState('');

  const submitNew = () => {
    const check = resolvePinInput(draft);
    if (!check.ok) { setValidationError(pinInputMessage(check.code)); setDraft(''); return; }
    setNewPin(draft);
    setDraft('');
    setValidationError('');
    setStep('confirm');
  };

  const submitConfirm = () => {
    if (draft !== newPin) {
      setValidationError(PIN_MISMATCH_MESSAGE);
      setDraft('');
      return;
    }
    op.run((stepUpProof, clientRequestId) =>
      setAccessUserPin({ actor: targetVm.actorId, pin: newPin, stepUpProof, clientRequestId })
    );
  };

  return (
    <div style={panelShell} data-testid="panel-pin-set">
      <StepUpGate op={op} onCancel={onCancel}>
        {step === 'new' && (
          <PinPadInline
            title={`Nuevo PIN de ${targetVm.primaryLabel}`}
            subtitle={`${PIN_LENGTH} dígitos`}
            value={draft}
            onChange={(v) => { setValidationError(''); setDraft(v); }}
            error={validationError}
            submitLabel="Continuar"
            onSubmit={submitNew}
            onCancel={onCancel}
          />
        )}
        {step === 'confirm' && (
          <PinPadInline
            title="Confirma el nuevo PIN"
            value={draft}
            onChange={(v) => { setValidationError(''); setDraft(v); }}
            loading={op.busy}
            error={validationError || (op.phase === 'error' ? op.errorMessage : '')}
            submitLabel="Guardar"
            onSubmit={submitConfirm}
            onCancel={onCancel}
          />
        )}
      </StepUpGate>
    </div>
  );
}

// Thin wrapper over the canonical PinPad so PIN forms share one shape.
function PinPadInline(props) {
  return (
    <PinPad icon="🔑" minLength={PIN_LENGTH} maxLength={PIN_LENGTH} {...props} />
  );
}

// ═══ PIN CLEAR (destructive) ══════════════════════════════════════════════
export function PinClearConfirm({ targetVm, onCancel, onSuccess }) {
  const op = useAccessOperation((result) => onSuccess(result.user));
  const submit = () => {
    op.run((stepUpProof, clientRequestId) =>
      clearAccessUserPin({
        actor: targetVm.actorId,
        expectedSessionVersion: targetVm.writeSnapshot.sessionVersion,
        stepUpProof, clientRequestId,
      })
    );
  };
  return (
    <div style={panelShell} data-testid="panel-pin-clear">
      <StepUpGate op={op} onCancel={onCancel}>
        <ErrorBanner message={op.phase === 'error' ? op.errorMessage : ''} />
        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 1.6 }}>
          Quitar el PIN de <strong>{targetVm.primaryLabel}</strong>. No podrá iniciar sesión hasta que le configures un PIN nuevo.
        </p>
        <ActionRow onConfirm={submit} onCancel={onCancel} busy={op.busy}>
          Quitar PIN
        </ActionRow>
      </StepUpGate>
    </div>
  );
}

// ═══ DEACTIVATE (destructive) ═════════════════════════════════════════════
export function DeactivateConfirm({ targetVm, onCancel, onSuccess }) {
  const op = useAccessOperation((result) => onSuccess(result.user));
  const submit = () => {
    op.run((stepUpProof, clientRequestId) =>
      deactivateAccessUser({
        actor: targetVm.actorId,
        expectedActive: targetVm.writeSnapshot.active,
        stepUpProof, clientRequestId,
      })
    );
  };
  return (
    <div style={panelShell} data-testid="panel-deactivate">
      <StepUpGate op={op} onCancel={onCancel}>
        <ErrorBanner message={op.phase === 'error' ? op.errorMessage : ''} />
        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 1.6 }}>
          Desactivar el acceso de <strong>{targetVm.primaryLabel}</strong>. No podrá volver a entrar hasta que lo reactives.
        </p>
        <ActionRow onConfirm={submit} onCancel={onCancel} busy={op.busy}>
          Desactivar
        </ActionRow>
      </StepUpGate>
    </div>
  );
}

// ═══ REACTIVATE ═══════════════════════════════════════════════════════════
export function ReactivateConfirm({ targetVm, onCancel, onSuccess }) {
  const op = useAccessOperation((result) => onSuccess(result.user));
  const submit = () => {
    op.run((stepUpProof, clientRequestId) =>
      reactivateAccessUser({
        actor: targetVm.actorId,
        expectedActive: targetVm.writeSnapshot.active,
        stepUpProof, clientRequestId,
      })
    );
  };
  return (
    <div style={panelShell} data-testid="panel-reactivate">
      <StepUpGate op={op} onCancel={onCancel}>
        <ErrorBanner message={op.phase === 'error' ? op.errorMessage : ''} />
        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 1.6 }}>
          Reactivar el acceso de <strong>{targetVm.primaryLabel}</strong>.
        </p>
        <ActionRow onConfirm={submit} onCancel={onCancel} busy={op.busy}>
          Activar
        </ActionRow>
      </StepUpGate>
    </div>
  );
}

// ═══ OWNER PIN CHANGE ═════════════════════════════════════════════════════
// The owner's own PIN is outside the V3 write API's scope (ASSIGNABLE_ROLES
// excludes owner entirely) — this reuses the EXISTING, already-proven legacy
// transport (api.setActorPin with targetActor:'owner', the same one
// OperationalMenu.jsx's "Gestionar PIN de administrador" flow already uses),
// not a second, invented mechanism. A successful self-change bumps
// session_version and invalidates the current token, so `onSuccess` here means
// "forced re-login", not "refresh the list" — the caller must log the owner out.
export function OwnerPinChangeFlow({ onCancel, onSuccess }) {
  const [step, setStep] = useState('new');
  const [newPin, setNewPin] = useState('');
  const [draft, setDraft] = useState('');
  const op = useAccessOperation(() => { setNewPin(''); setDraft(''); onSuccess(); });
  const [validationError, setValidationError] = useState('');

  const submitNew = () => {
    const check = resolvePinInput(draft);
    if (!check.ok) { setValidationError(pinInputMessage(check.code)); setDraft(''); return; }
    setNewPin(draft);
    setDraft('');
    setValidationError('');
    setStep('confirm');
  };

  const submitConfirm = () => {
    if (draft !== newPin) {
      setValidationError(PIN_MISMATCH_MESSAGE);
      setDraft('');
      return;
    }
    op.run(async (stepUpProof) => {
      const res = await api.setActorPin({
        targetActor: 'owner', newPin, stepUpProof, confirmation: 'CHANGE_OWNER_PIN',
      });
      if (res && res._ok !== false && res.ok === true) return { kind: 'ok', user: { actor: res.actor } };
      return { kind: 'server', status: res && res._status, code: null };
    });
  };

  return (
    <div style={panelShell} data-testid="panel-owner-pin">
      <StepUpGate op={op} onCancel={onCancel}>
        {step === 'new' && (
          <PinPadInline
            title="Nuevo PIN de propietario"
            subtitle={`${PIN_LENGTH} dígitos`}
            value={draft}
            onChange={(v) => { setValidationError(''); setDraft(v); }}
            error={validationError}
            submitLabel="Continuar"
            onSubmit={submitNew}
            onCancel={onCancel}
          />
        )}
        {step === 'confirm' && (
          <PinPadInline
            title="Confirma el nuevo PIN"
            value={draft}
            onChange={(v) => { setValidationError(''); setDraft(v); }}
            loading={op.busy}
            error={validationError || (op.phase === 'error' ? 'No se pudo guardar el PIN. Vuelve a confirmar tu identidad e inténtalo de nuevo.' : '')}
            submitLabel="Guardar"
            onSubmit={submitConfirm}
            onCancel={onCancel}
          />
        )}
      </StepUpGate>
    </div>
  );
}

// ═══ DISPATCHER ═══════════════════════════════════════════════════════════
export default function AccessOperationPanel({ operation, targetVm, onCancel, onSuccess }) {
  switch (operation) {
    case 'create': return <CreateAccessForm onCancel={onCancel} onSuccess={onSuccess} />;
    case 'rename': return <RenameForm targetVm={targetVm} onCancel={onCancel} onSuccess={onSuccess} />;
    case 'role': return <RoleForm targetVm={targetVm} onCancel={onCancel} onSuccess={onSuccess} />;
    case 'pin': return <PinSetForm targetVm={targetVm} onCancel={onCancel} onSuccess={onSuccess} />;
    case 'clearPin': return <PinClearConfirm targetVm={targetVm} onCancel={onCancel} onSuccess={onSuccess} />;
    case 'deactivate': return <DeactivateConfirm targetVm={targetVm} onCancel={onCancel} onSuccess={onSuccess} />;
    case 'reactivate': return <ReactivateConfirm targetVm={targetVm} onCancel={onCancel} onSuccess={onSuccess} />;
    case 'ownerPin': return <OwnerPinChangeFlow onCancel={onCancel} onSuccess={onSuccess} />;
    default: return null;
  }
}

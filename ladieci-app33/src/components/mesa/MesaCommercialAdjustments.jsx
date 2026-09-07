// MesaCommercialAdjustments — Ajuste Comercial V1, Frontend Slice C. The ONE
// shared "adjust what a comanda owes" surface, used identically by the
// OPEN-table Payment Hub (VerCuentaBody) and the CLOSED-session detail
// (UltimasCuentasModal), so there is exactly one adjustment UI in Mesa — never
// two that could drift apart (same discipline as MesaPaymentsList / MesaAccountBalance).
//
// ADMIN ONLY (contract §9/§28). The caller passes `canAdjust`; a non-admin gets
// nothing rendered at all — no section, no disabled CTA. The backend
// (mesa_post_commercial_adjustment_v1, admin/owner only) stays the final authority
// regardless of what this hides.
//
// ORDER-SCOPED, PERMANENT IDENTITY ONLY (contract §10). Targets exclusively
// `command.financial.orderUid`; the recycled display `#NNN` is NEVER an
// adjustment target and NEVER a fallback. A command without `financial.adjustable
// === true` (or without an orderUid) is not given a CTA.
//
// CLOSED TABLES ARE FIRST-CLASS (contract §21). This component never looks at
// table/session status: mesa_post_commercial_adjustment_v1 accepts a closed
// table session and never reopens it. The caller decides whether to render it;
// this component only renders what the account data says.
//
// NO OPTIMISTIC FINANCIAL MUTATION (contract §19). On success it re-reads the
// canonical account via onAdjusted() and renders whatever the backend then
// says — it never patches originalObligation / currentObligation /
// commercialAdjustment / unpaid / overCollected locally.
import { useRef, useState } from "react";
import { createMesaRequestId, describeMesaError, mesaApi } from "../../mesa/mesaApi";
import { euro } from "./mesaFormat";
import {
  parseAdjustmentAmountInput, formatAmountForInput, isAdjustmentValid, adjustmentDelta,
  projectedOverCollected, accountObligationTotal, adjustableCommands,
  ADJUSTMENT_NO_REFUND_WARNING, ADJUSTMENT_REFUND_SEPARATE_NOTE,
} from "./mesaAdjustment";

function AdjustForm({
  command, accountObligationTotal: obligationTotal, accountPaid, currentOverCollected,
  amount, onAmountChange, reason, onReasonChange, busy, error, onCancel, onSubmit,
}) {
  const current = Number(command.financial.currentObligation) || 0;
  const parsed = parseAdjustmentAmountInput(amount);
  const valid = isAdjustmentValid(parsed, current);
  const delta = valid ? adjustmentDelta(current, parsed) : 0;
  const projected = valid
    ? projectedOverCollected({ accountObligationTotal: obligationTotal, accountPaid, currentObligation: current, newGross: parsed })
    : 0;
  // Only warn about NEW over-collection this reduction would create.
  const showProjectedOver = valid && projected > 0 && projected > (Number(currentOverCollected) || 0);
  const reasonText = String(reason || "").trim();

  return (
    <div className="mesa-payhist-form" data-testid="mesa-adjustment-form">
      <div className="mesa-payhist-form-row">
        <span>Venta original</span>
        <strong data-testid="mesa-adjustment-original">{euro(command.financial.originalObligation)}</strong>
      </div>
      <div className="mesa-payhist-form-row">
        <span>Obligación actual</span>
        <strong data-testid="mesa-adjustment-current">{euro(current)}</strong>
      </div>

      <div className="mesa-hub-field">
        <div className="mesa-hub-field-label">Nuevo importe</div>
        <input className="mesa-input" data-testid="mesa-adjustment-amount" inputMode="decimal"
          value={amount} onChange={(event) => onAmountChange(event.target.value)} />
      </div>

      <div className="mesa-payhist-form-row">
        <span>Ajuste</span>
        <strong data-testid="mesa-adjustment-delta">{valid ? euro(delta) : "—"}</strong>
      </div>

      <div className="mesa-hub-field">
        <div className="mesa-hub-field-label">Motivo</div>
        <input className="mesa-input" data-testid="mesa-adjustment-reason"
          placeholder="Describe el motivo del ajuste"
          value={reason} onChange={(event) => onReasonChange(event.target.value)} />
      </div>

      {/* §14 — load-bearing: an adjustment changes what is OWED, it does not
          return money. */}
      <div className="mesa-payhist-warning" data-testid="mesa-adjustment-no-refund">{ADJUSTMENT_NO_REFUND_WARNING}</div>
      {showProjectedOver && (
        <div className="mesa-payhist-warning" data-testid="mesa-adjustment-projected-over">
          {`Quedarán ${euro(projected)} cobrados de más. ${ADJUSTMENT_REFUND_SEPARATE_NOTE}`}
        </div>
      )}

      {error && <div className="mesa-banner mesa-error" data-testid="mesa-adjustment-error">{error}</div>}

      <div className="mesa-payhist-form-actions">
        <button type="button" className="mesa-btn" disabled={busy}
          data-testid="mesa-adjustment-cancel" onClick={onCancel}>Cancelar</button>
        <button type="button" className="mesa-btn green" disabled={busy || !valid || !reasonText}
          data-testid="mesa-adjustment-confirm" onClick={onSubmit}>
          {busy ? "Registrando…" : "Registrar ajuste"}
        </button>
      </div>
    </div>
  );
}

// CHECK-CENTRIC UNIVERSAL CASH V1 — `api`/`describeError` are injectable,
// defaulting to Mesa's own mesaApi/describeMesaError so every EXISTING Mesa
// caller is byte-identical with zero changes. The check-centric cash surface
// passes a `cashApi`-backed adapter instead (contract report §O).
export default function MesaCommercialAdjustments({
  sessionId, account, canAdjust, onAdjusted,
  api = mesaApi, describeError = describeMesaError,
}) {
  const commands = adjustableCommands(account?.commands);
  const obligationTotal = accountObligationTotal(account?.commands);
  const accountPaid = Number(account?.paid) || 0;
  const currentOverCollected = Number(account?.overCollected) || 0;

  const [openUid, setOpenUid] = useState(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  // §7/§18 — ONE stable id per opened adjustment attempt. Created ONLY when a
  // form is opened (openAdjust below) — never a throwaway initializer that runs
  // on every render (contract §7 calls that pattern out by name) — and never
  // regenerated because this component re-rendered or a request temporarily
  // failed. So a retry of the same open form replays instead of
  // double-adjusting; a genuinely new logical attempt (a different comanda, or
  // the same one reopened after Cancelar) gets a fresh id.
  const requestIdRef = useRef(null);

  if (!canAdjust || commands.length === 0) return null;

  const openAdjust = (command) => {
    setError(""); setSuccess(null);
    const uid = command.financial.orderUid;
    if (openUid !== uid) {
      requestIdRef.current = createMesaRequestId("adj");
      setAmount(formatAmountForInput(command.financial.currentObligation));
      setReason("");
    }
    setOpenUid((current) => (current === uid ? null : uid));
  };

  // §18 — Cancelar sends no request, creates no revision, mutates nothing.
  // Reopening later is a new logical attempt (openAdjust regenerates the id
  // because openUid no longer matches).
  const cancelAdjust = () => { setOpenUid(null); setError(""); };

  const submitAdjust = async (command) => {
    const current = Number(command.financial.currentObligation) || 0;
    const newGross = parseAdjustmentAmountInput(amount);
    if (!isAdjustmentValid(newGross, current)) {
      setError(newGross > current
        ? "Un ajuste solo puede reducir la obligación."
        : "El importe no es válido.");
      return;
    }
    const reasonText = String(reason || "").trim();
    if (!reasonText) { setError("Indica el motivo del ajuste."); return; }

    setBusy(true); setError("");
    try {
      const result = await api.adjust(sessionId, {
        orderUid: command.financial.orderUid,
        newGross,
        reason: reasonText,
        // §17 — optimistic concurrency: the operator approved a reduction FROM
        // the number they were shown. If the obligation moved underneath them
        // the backend answers MESA_ADJUSTMENT_STALE_OBLIGATION rather than
        // silently adjusting a different sale.
        expectedCurrentGross: current,
        clientRequestId: requestIdRef.current,
      });
      setOpenUid(null);
      setBusy(false);
      setSuccess({
        commandNumber: command.commandNumber,
        currentObligation: result?.currentObligation ?? newGross,
      });
      // §19/§23 — never fabricate the new state locally; the canonical account
      // is only what the server says after this adjustment.
      await onAdjusted();
    } catch (err) {
      setBusy(false);
      setError(describeError(err));
      // §17 — the obligation changed under the operator (another device, a
      // cancellation). The FE's displayed figure is not authoritative: refresh
      // from the server so the operator re-decides against the real number.
      // The shared core (order_obligation_apply_adjustment_v1) raises these
      // same MESA_ADJUSTMENT_* codes for the check-centric adapter too (§15
      // of the brief: reuse, not renamed) — no ORDER_ variant to add here.
      if (err?.code === "MESA_ADJUSTMENT_STALE_OBLIGATION" || err?.code === "MESA_ADJUSTMENT_ORDER_NOT_FOUND") {
        await onAdjusted();
      }
    }
  };

  return (
    <section className="mesa-payhist" data-testid="mesa-commercial-adjustments">
      <h3 className="mesa-payhist-title">Ajustes comerciales</h3>
      {success && (
        <div className="mesa-payhist-success" data-testid="mesa-adjustment-success">
          {`Ajuste registrado · Comanda ${success.commandNumber} · Obligación actual ${euro(success.currentObligation)}`}
        </div>
      )}
      {commands.map((command) => {
        const uid = command.financial.orderUid;
        const isOpen = openUid === uid;
        return (
          <div className="mesa-payhist-item" key={uid} data-testid="mesa-adjustment-item">
            <div className="mesa-payhist-row" data-testid="mesa-adjustment-command">
              {/* §11 — enough context to know WHICH comanda; the orderUid is an
                  internal targeting key and is deliberately NOT shown. */}
              <span className="mesa-payhist-meta">
                Comanda {command.commandNumber}
                {command.financial.commercialAdjustment < 0 && (
                  <span data-testid="mesa-adjustment-existing"> · ajuste {euro(command.financial.commercialAdjustment)}</span>
                )}
              </span>
              <strong className="mesa-payhist-amount">{euro(command.financial.currentObligation)}</strong>
            </div>
            {canAdjust && (
              <button type="button" className={`mesa-btn small mesa-payhist-refund-btn${isOpen ? " active" : ""}`}
                data-testid="mesa-adjustment-open-btn" onClick={() => openAdjust(command)}>
                Ajuste comercial
              </button>
            )}
            {isOpen && (
              <AdjustForm
                command={command}
                accountObligationTotal={obligationTotal}
                accountPaid={accountPaid}
                currentOverCollected={currentOverCollected}
                amount={amount} onAmountChange={(value) => { setError(""); setAmount(value); }}
                reason={reason} onReasonChange={(value) => { setError(""); setReason(value); }}
                busy={busy} error={error}
                onCancel={cancelAdjust}
                onSubmit={() => submitAdjust(command)}
              />
            )}
          </div>
        );
      })}
    </section>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./OperationalSuccessSplash.css";
import { OPERATIONAL_TRANSACTION_MIN_DURATION_MS } from "../../order/operationalTransaction";

let activeSplash = null;

export const OPERATIONAL_SUCCESS_DURATION_MS = OPERATIONAL_TRANSACTION_MIN_DURATION_MS;

export default function OperationalSuccessSplash({
  phase = "success",
  title,
  subtitle,
  optionalSubtitle,
  duration = OPERATIONAL_SUCCESS_DURATION_MS,
  startedAt = null,
  onComplete,
}) {
  const owner = useRef(Symbol("operational-success-splash"));
  const completed = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const [active, setActive] = useState(true);
  const minimumDuration = Number.isFinite(Number(duration))
    ? Math.max(0, Number(duration))
    : OPERATIONAL_SUCCESS_DURATION_MS;
  const elapsed = startedAt !== null && startedAt !== undefined && Number.isFinite(Number(startedAt))
    ? Math.max(0, Date.now() - Number(startedAt))
    : 0;
  const safeDuration = Math.max(0, minimumDuration - elapsed);
  const isPending = phase === "pending";
  const secondaryText = subtitle ?? optionalSubtitle;

  // A parent re-render must not restart the visible 500 ms window. Keep the
  // latest callback in a ref while the timer effect depends only on timing.
  onCompleteRef.current = onComplete;

  const complete = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    setActive(false);
    if (activeSplash?.owner === owner.current) activeSplash = null;
    if (typeof onCompleteRef.current === "function") onCompleteRef.current();
  }, []);

  useEffect(() => {
    if (activeSplash && activeSplash.owner !== owner.current) {
      activeSplash.deactivate();
    }
    activeSplash = {
      owner: owner.current,
      deactivate: () => {
        completed.current = true;
        setActive(false);
      },
    };

    const timer = isPending ? null : setTimeout(complete, safeDuration);
    return () => {
      if (timer !== null) clearTimeout(timer);
      if (activeSplash?.owner === owner.current) activeSplash = null;
    };
  }, [complete, isPending, safeDuration]);

  if (!active || typeof document === "undefined" || !String(title ?? "").trim()) return null;

  return createPortal((
    <div className="operational-success-splash" role="status" aria-live="polite" aria-atomic="true">
      <div className={`operational-success-splash__card${isPending ? " operational-success-splash__card--pending" : ""}`}>
        <span
          className={`operational-success-splash__mark${isPending ? " operational-success-splash__mark--pending" : ""}`}
          aria-hidden="true"
        >
          {isPending ? "" : "✓"}
        </span>
        <div className="operational-success-splash__title">{title}</div>
        {secondaryText ? (
          <div className="operational-success-splash__subtitle">{secondaryText}</div>
        ) : null}
      </div>
    </div>
  ), document.body);
}

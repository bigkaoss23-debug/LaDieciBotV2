import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./OperationalSuccessSplash.css";

let activeSplash = null;

export default function OperationalSuccessSplash({
  phase = "success",
  title,
  subtitle,
  optionalSubtitle,
  duration = 300,
  onComplete,
}) {
  const owner = useRef(Symbol("operational-success-splash"));
  const completed = useRef(false);
  const [active, setActive] = useState(true);
  const safeDuration = Number.isFinite(Number(duration))
    ? Math.max(0, Number(duration))
    : 300;
  const isPending = phase === "pending";
  const secondaryText = subtitle ?? optionalSubtitle;

  const complete = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    setActive(false);
    if (activeSplash?.owner === owner.current) activeSplash = null;
    if (typeof onComplete === "function") onComplete();
  }, [onComplete]);

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

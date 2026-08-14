// ===============================================================
// OrderLineView.jsx — the single renderer for a normalized order line.
//
// Slice 1 of the canonical order-picker migration (see
// CANONICAL_ORDER_PICKER_OPUS_ARCHITECTURE_CHALLENGE_2026-08-14.md, §22).
//
// View-model in, JSX out: this component owns no state, performs no
// interpretation of raw item shapes, and makes no network/mutation calls.
// Callers normalize first (`normalizeOrderLine(item)`) and pass the result
// as `line`. Because extras/removed/note/displayName are already unified by
// the normalizer, this component doesn't need to know or care whether the
// underlying item was a catalogue product, a beverage, or a custom pizza —
// a custom pizza's selected ingredients arrive here as ordinary `extras`.
//
// Deliberately does NOT render quantity or price: both existing migrated
// consumers (TabMesa's draft panel, NuevoPedidoModal's item list) already
// show those with their own surface-specific formatting/placement/markup
// (a Spanish Intl.NumberFormat vs a plain toFixed(2), a static quantity
// prefix vs an interactive +/- stepper) — unifying THAT is not part of
// fixing the two Slice-1 defects (custom-pizza detail loss, invisible
// removed ingredients) and would be a visible, unrequested behavior change.
// `showQuantityPrefix` only controls the "2× " text prefix on the name row,
// since that one detail is part of the name line's own text content on the
// one surface that already has it (TabMesa).
//
// `classNames`/`styles` (both optional, keyed by `name`/`extras`/`removed`/
// `note`) let each host surface keep its OWN established visual language --
// e.g. TabMesa's muted-gray `.mesa-muted`/italic `.mesa-command-note` --
// instead of this shared component inventing a new, unstyled default that
// would visually regress an existing screen. Structure/interpretation is
// shared; per-surface appearance is not.
// ===============================================================

function formatExtras(extras) {
  return extras
    .map((extra) => (extra.quantity > 1 ? `${extra.name} ×${extra.quantity}` : extra.name))
    .join(", ");
}

export function OrderLineView({ line, showQuantityPrefix = false, testId, classNames = {}, styles = {} }) {
  if (!line) return null;
  const prefixed = testId ? `${testId}-` : "";
  const hasSecondary = Boolean(line.secondaryName);
  const hasExtras = line.extras.length > 0;
  const hasRemoved = line.removed.length > 0;
  const hasNote = Boolean(line.note);
  const cls = (key, fallback) => [fallback, classNames[key]].filter(Boolean).join(" ");

  return (
    <div className="order-line-view" data-testid={testId || "order-line-view"}>
      <div className={cls("name", "order-line-name")} style={styles.name} data-testid={`${prefixed}order-line-name`}>
        {showQuantityPrefix && line.quantity ? `${line.quantity}× ` : ""}
        {line.displayName}
        {hasSecondary ? ` / ${line.secondaryName}` : ""}
      </div>
      {hasExtras && (
        <div className={cls("extras", "order-line-extras")} style={styles.extras} data-testid={`${prefixed}order-line-extras`}>
          + {formatExtras(line.extras)}
        </div>
      )}
      {hasRemoved && (
        <div className={cls("removed", "order-line-removed")} style={styles.removed} data-testid={`${prefixed}order-line-removed`}>
          Sin: {line.removed.join(", ")}
        </div>
      )}
      {hasNote && (
        <div className={cls("note", "order-line-note")} style={styles.note} data-testid={`${prefixed}order-line-note`}>
          Nota: {line.note}
        </div>
      )}
    </div>
  );
}

export default OrderLineView;

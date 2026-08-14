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
// on top of the shared base below. Structure/interpretation is shared;
// per-surface appearance is layered over it.
//
// WHY THERE IS A BASE STYLESHEET AT ALL (added after the iPhone review)
// --------------------------------------------------------------------
// The original version shipped these class names with NO stylesheet, on the
// theory that every host would dress them itself. TabMesa does. DraftSummary
// -- the pre-confirmation comanda drawer, i.e. the one surface where an
// operator actually proof-reads what they are about to send to the kitchen --
// did not, and the app sets no global text colour (constants.js styles
// `html,body,#root` with a background and no `color`). So extras, removed
// ingredients and notes inherited the user-agent default of BLACK, on a
// #070707 panel. Not "too dark": invisible. A shared renderer that is
// unreadable unless every caller remembers to dress it is a trap, so the
// readable treatment is now the default and hosts override it, rather than
// the other way round.
// ===============================================================

// Scoped to .order-line-view so it can never leak, and every rule is a single
// class selector -- a host's own class (applied to the same element) wins on
// document order, keeping TabMesa's established look exactly as it was.
export const orderLineViewCss = `
.order-line-view{min-width:0}
.order-line-view .order-line-name{color:#f4ead8;font-size:13.5px;font-weight:800;line-height:1.3;word-break:break-word}
.order-line-view .order-line-extras{color:#7BD88F;font-size:12px;font-weight:700;line-height:1.35;margin-top:3px;word-break:break-word}
.order-line-view .order-line-removed{color:#FF8A7A;font-size:12px;font-weight:700;line-height:1.35;margin-top:2px;word-break:break-word}
.order-line-view .order-line-note{color:#E9C583;font-size:12px;font-style:italic;line-height:1.35;margin-top:2px;word-break:break-word}
`;

// Injected once, from the component itself, rather than left for each host to
// remember -- that "remember" is exactly what failed. Idempotent and keyed by
// id, so N lines on screen still produce exactly one <style> node.
const STYLE_ID = "order-line-view-base-css";
function ensureBaseStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = orderLineViewCss;
  document.head.appendChild(el);
}

function formatExtras(extras) {
  return extras
    .map((extra) => (extra.quantity > 1 ? `${extra.name} ×${extra.quantity}` : extra.name))
    .join(", ");
}

export function OrderLineView({ line, showQuantityPrefix = false, testId, classNames = {}, styles = {} }) {
  ensureBaseStyle();
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

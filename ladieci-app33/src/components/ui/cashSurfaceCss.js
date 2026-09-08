// UNIFIED_CASH_UI_SURFACE_V1 — the CSS the SHARED cash components
// (MesaAccountBalance / MesaPaymentsList / MesaCommercialAdjustments) need to
// render, extracted so it has ONE home instead of being trapped inside
// TabMesa.jsx's floor-plan stylesheet.
//
// WHY. Those three components are already shared between Mesa's payment hub and
// the Servicio/Retiro CheckCashPanel. Their `mesa-*` class rules, however, lived
// only inside TabMesa.jsx's `const css` template and were injected only by the
// three floor renders that mount TabMesa. CheckCashPanel mounts the same
// components without TabMesa, so in Servicio they rendered with no rules at all.
//
// This is a PRESENTATION-ONLY extraction: every rule below is verbatim from
// TabMesa.jsx, none is scoped under `.mesa-root`, and the class names / layout /
// specificity are unchanged. TabMesa.jsx now imports this string and prepends it
// to its own stylesheet, so its effective CSS is byte-identical to before.
// CheckCashPanel injects this same string directly. Neither depends on the
// other; both depend on this module.
//
// NOT a redesign, NOT new tokens. If a rule here changes, Mesa's payment hub
// changes too — by construction.

export const CASH_SURFACE_CSS = `
.mesa-btn{border:1px solid rgba(208,184,145,.25);border-radius:12px;background:rgba(255,255,255,.05);color:#f9f2e5;padding:10px 14px;font-weight:850;cursor:pointer}.mesa-btn:hover{background:rgba(255,255,255,.09)}.mesa-btn:disabled{opacity:.4;cursor:wait}
.mesa-btn.primary{background:#2563EB;border-color:#2563EB;color:#fff}.mesa-btn.gold{background:#d7a84b;border-color:#d7a84b;color:#211707}.mesa-btn.green{background:#178447;border-color:#20a85d}.mesa-btn.danger{color:#ff8f80;border-color:rgba(232,52,28,.55)}
.mesa-btn.small{padding:7px 10px;border-radius:10px;font-size:12px}
.mesa-btn.small.active{border-color:#d7a84b;background:rgba(215,168,75,.14);color:#f8ecd2}
.mesa-input{width:100%;box-sizing:border-box;border:1px solid rgba(208,184,145,.28);border-radius:11px;background:#0b0b0a;color:#fff;padding:12px 13px;font:inherit;outline:none}.mesa-input:focus{border-color:#d7a84b}
.mesa-banner{border:1px solid rgba(56,189,248,.35);border-radius:13px;padding:12px 14px;background:rgba(56,189,248,.09);color:#b9eaff;font-size:13px;line-height:1.45}.mesa-error{border-color:rgba(232,52,28,.5);background:rgba(232,52,28,.1);color:#ffaaa0}
.mesa-hub-mode{padding:10px 6px;border:1px solid rgba(255,255,255,.10);border-radius:11px;background:rgba(255,255,255,.03);color:#efe6d5;font:inherit;font-size:12.5px;font-weight:820;cursor:pointer;line-height:1.2}
.mesa-hub-mode:hover:not(:disabled){background:rgba(255,255,255,.07)}
.mesa-hub-mode:disabled{opacity:.35;cursor:not-allowed}
.mesa-hub-mode.active{border-color:#d7a84b;background:rgba(215,168,75,.13);color:#f8ecd2}
.mesa-hub-totals{border-top:1px dashed rgba(255,255,255,.14);margin-top:8px;padding-top:10px}
.mesa-hub-total-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:4px 0;font-size:14px;color:#e6dcc9}
.mesa-hub-total-row strong{font-weight:800}
.mesa-hub-total-row.outstanding{margin-top:6px;padding-top:10px;border-top:1px solid rgba(255,255,255,.10);color:#d7a84b;font-size:17px}
.mesa-hub-total-row.outstanding strong{color:#d7a84b;font-size:22px;font-weight:950}
/* OVER-COLLECTED / AJUSTE COMERCIAL V1 SLICE C — same amber warning language
   as .mesa-payhist-warning below, not a new color vocabulary: this row is a
   different DIRECTION of the same "needs attention" state as .outstanding
   (owed TO the customer instead of BY them), and the label already says which. */
.mesa-hub-total-row.overcollected{margin-top:6px;padding-top:10px;border-top:1px solid rgba(215,168,75,.25);color:#d7a84b;font-size:15px}
.mesa-hub-total-row.overcollected strong{color:#d7a84b;font-weight:900}
.mesa-hub-field{margin-bottom:14px}
.mesa-hub-field:last-child{margin-bottom:0}
.mesa-hub-field-label{color:#a99d89;font-size:12px;font-weight:800;margin-bottom:8px}
/* REFUND V1 -- MesaPaymentsList. Same visual language as the payment hub
   (mesa-hub-* tokens), compact by design: mobile is first-class here (§24) and
   this list can carry several payments/refunds per check. */
.mesa-payhist{margin-top:16px;border-top:1px dashed rgba(255,255,255,.14);padding-top:14px}
.mesa-payhist-title{margin:0 0 8px;color:#d9c8aa;font-size:13px;font-weight:900;letter-spacing:.4px}
.mesa-payhist-item{border-bottom:1px solid rgba(255,255,255,.065);padding:8px 0}
.mesa-payhist-item:last-child{border-bottom:0}
.mesa-payhist-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-size:13.5px;padding:2px 0}
.mesa-payhist-meta{color:#cfc4b0}
.mesa-payhist-amount{color:#f4ecdd;font-weight:850}
.mesa-payhist-amount.refund{color:#ff8f80}
/* The nested refund child is visually subordinate to its original (§9/§25:
   "refund children clearly subordinate to original transaction") -- indent
   plus a slightly smaller, muted meta label, never a competing row. */
.mesa-payhist-child{padding-left:16px;font-size:12.5px}
.mesa-payhist-child .mesa-payhist-meta{color:#a99d89}
.mesa-payhist-full{margin-top:4px;color:#65d995;font-size:11.5px;font-weight:800}
.mesa-payhist-remaining{margin-top:4px;color:#d7a84b;font-size:11.5px;font-weight:800}
.mesa-payhist-refund-btn{margin-top:8px;min-height:40px;padding:8px 14px;font-size:13px}
.mesa-payhist-success{margin-bottom:10px;border:1px solid rgba(101,217,149,.34);border-radius:12px;background:rgba(101,217,149,.08);color:#65d995;padding:10px 12px;font-size:13px;font-weight:800}
.mesa-payhist-form{position:relative;margin-top:10px;border:1px solid rgba(215,168,75,.34);border-radius:14px;background:rgba(215,168,75,.045);padding:12px 12px 14px}
.mesa-payhist-form-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:3px 0;font-size:13px;color:#cfc4b0}
.mesa-payhist-form-row strong{color:#f4ecdd;font-weight:800}
.mesa-payhist-reasons{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
@media(min-width:420px){.mesa-payhist-reasons{grid-template-columns:repeat(3,1fr)}}
/* §16 -- load-bearing economic-effect copy: prominent but compact, never a
   full-width banner that would crowd out the amount/reason fields above it. */
.mesa-payhist-warning{margin-top:12px;border:1px solid rgba(215,168,75,.4);border-radius:11px;background:rgba(215,168,75,.10);color:#f2dfb8;font-size:12.5px;font-weight:750;line-height:1.5;padding:9px 11px}
/* §17 -- external-settlement (tarjeta/bizum) recording notice, visually
   secondary to the economic warning above it. */
.mesa-payhist-external{margin-top:8px;color:#a99d89;font-size:11.5px;line-height:1.5}
.mesa-payhist-form-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
.mesa-payhist-form-actions .mesa-btn{min-height:46px}
`;

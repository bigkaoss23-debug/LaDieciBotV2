// ===============================================================
// TKT-02 (2026-08-21 forensic audit) — a mixed payment must read as mixed.
//
// Real case: order #999015 on Mesa 4 was settled with 51.00 tarjeta + 30.00
// efectivo + 20.00 bizum, so mesa_post_payment_v1 derived metodo_pago='MIXTO'.
// Three operator surfaces branched only over tarjeta/efectivo/bizum and each
// got it wrong in its own way:
//
//   TabListos "Ya pagado" chip   -> "💵 Ya pagado"   (green — reads as CASH)
//   OrdenCard "Ya pagado" chip   -> "💵 Ya pagado"   (green — reads as CASH)
//   TabListos method chip        -> "❓ Sin método"  (reads as UNPAID)
//   TabListos cash strip         -> in NO bucket at all (101.00 € vanished)
// ===============================================================

import { describePaymentMethod, hasKnownPaymentMethod, MIXED_PAYMENT_METHOD } from "./paymentMethodDisplay";

const fs = require("fs");
const path = require("path");
const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");

describe("TKT-02 — MIXTO is a first-class method, never cash and never unknown", () => {
  test("the durable token the backend actually writes resolves", () => {
    expect(MIXED_PAYMENT_METHOD).toBe("MIXTO");
    const d = describePaymentMethod("MIXTO");
    expect(d.key).toBe("mixto");
    expect(d.label).toBe("Mixto");
    expect(d.mixed).toBe(true);
  });

  test("it is never rendered as cash", () => {
    const mixto = describePaymentMethod("MIXTO");
    const efectivo = describePaymentMethod("efectivo");
    expect(mixto.icon).not.toBe(efectivo.icon);
    expect(mixto.rgb).not.toBe(efectivo.rgb);
    expect(mixto.text).not.toBe(efectivo.text);
    expect(mixto.label).not.toMatch(/efectivo/i);
  });

  test('it is never rendered as "sin método"', () => {
    const mixto = describePaymentMethod("MIXTO");
    const unknown = describePaymentMethod(null);
    expect(mixto.key).not.toBe(unknown.key);
    expect(mixto.label).not.toBe("Sin método");
    expect(mixto.icon).not.toBe("❓");
    expect(hasKnownPaymentMethod("MIXTO")).toBe(true);
  });

  test("it is not rendered as any single tender — no dominant method is inferred", () => {
    const mixto = describePaymentMethod("MIXTO");
    for (const single of ["efectivo", "tarjeta", "bizum"]) {
      const d = describePaymentMethod(single);
      expect(mixto.key).not.toBe(d.key);
      expect(mixto.label).not.toBe(d.label);
      expect(mixto.icon).not.toBe(d.icon);
    }
  });

  test("case and stray whitespace all resolve to the same entry", () => {
    for (const raw of ["MIXTO", "mixto", "Mixto", "  MIXTO  "]) {
      expect(describePaymentMethod(raw).key).toBe("mixto");
    }
  });
});

describe("TKT-02 — the three real tenders keep their existing identity", () => {
  test.each([
    ["efectivo", "Efectivo", "💵"],
    ["tarjeta", "Tarjeta", "💳"],
    ["bizum", "Bizum", "📱"],
  ])("%s stays %s %s", (raw, label, icon) => {
    const d = describePaymentMethod(raw);
    expect(d.key).toBe(raw);
    expect(d.label).toBe(label);
    expect(d.icon).toBe(icon);
    expect(d.mixed).toBe(false);
  });

  test("every entry is visually distinct from every other", () => {
    const all = ["efectivo", "tarjeta", "bizum", "MIXTO", null].map(describePaymentMethod);
    expect(new Set(all.map((d) => d.icon)).size).toBe(all.length);
    expect(new Set(all.map((d) => d.key)).size).toBe(all.length);
    expect(new Set(all.map((d) => d.rgb)).size).toBe(all.length);
  });
});

describe("TKT-02 — anything unrecognised is explicitly unknown, never a tender-coloured default", () => {
  test.each([[null], [undefined], [""], ["   "], [42], [{}], ["paypal"]])("%p -> Sin método", (raw) => {
    const d = describePaymentMethod(raw);
    expect(d.key).toBe("unknown");
    expect(d.label).toBe("Sin método");
    expect(d.icon).toBe("❓");
    expect(hasKnownPaymentMethod(raw)).toBe(false);
  });
});

describe("TKT-02 — the audited surfaces consume the shared mapping, not their own chains", () => {
  const TAB_LISTOS = read("../components/ordenes/TabListos.jsx");
  const ORDEN_CARD = read("../components/ordenes/OrdenCard.jsx");

  test("both files import describePaymentMethod", () => {
    for (const src of [TAB_LISTOS, ORDEN_CARD]) {
      expect(src).toMatch(/import \{ describePaymentMethod \} from ['"][^'"]*paymentMethodDisplay['"]/);
    }
  });

  test('the "Ya pagado" chips no longer branch tarjeta-or-else', () => {
    for (const src of [TAB_LISTOS, ORDEN_CARD]) {
      // the exact shape of the defect: a binary choice that painted MIXTO as cash
      expect(src).not.toMatch(/metodo_pago\s*===?\s*"tarjeta"\s*\?\s*"💳"\s*:\s*"💵"/);
    }
  });

  test('the method chip no longer falls through to "Sin método" for a paid order', () => {
    expect(TAB_LISTOS).not.toMatch(/metodo_pago==="bizum"\?"📱 Bizum"\s*:\s*"❓ Sin método"/);
  });

  test("the cash strip buckets MIXTO instead of dropping it", () => {
    // totEuro counts every retirado, so the per-method figures beside it must
    // account for MIXTO or the strip visibly fails to add up
    expect(TAB_LISTOS).toMatch(/const totMixto\s*=\s*byMethod\("mixto"\)/);
    expect(TAB_LISTOS).toMatch(/totMixto > 0 &&/);
    // and the old blind filters are gone
    expect(TAB_LISTOS).not.toMatch(/retirados\.filter\(o=>o\.metodo_pago==="efectivo"\)/);
    expect(TAB_LISTOS).not.toMatch(/retirados\.filter\(o=>!o\.metodo_pago\)/);
  });
});

describe("TKT-02 — presentation only: the ledger is never touched", () => {
  test("the module writes nothing and recomputes nothing", () => {
    const src = read("paymentMethodDisplay.js");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code).not.toMatch(/fetch|axios|api\.|supabase|sb\./);
    expect(code).not.toMatch(/metodo_pago\s*=[^=]/);
    expect(code).not.toMatch(/order_financial_events|payment_transactions/);
  });
});

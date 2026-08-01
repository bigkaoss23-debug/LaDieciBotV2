import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C } from "../../constants";
import { createMessaRequestId, describeMessaError, messaApi } from "../../messa/messaApi";

const euro = (value) => new Intl.NumberFormat("es-ES", {
  style: "currency", currency: "EUR", minimumFractionDigits: 2,
}).format(Number(value) || 0);

const METHODS = [
  { id: "efectivo", label: "Efectivo", icon: "💵", color: "#16A34A" },
  { id: "tarjeta", label: "Tarjeta", icon: "💳", color: "#2563EB" },
  { id: "bizum", label: "Bizum", icon: "📱", color: "#8B5CF6" },
];

const STATUS = {
  free: { label: "Libre", color: "#22C55E", bg: "rgba(34,197,94,.18)" },
  open: { label: "Cuenta abierta", color: "#F59E0B", bg: "rgba(245,158,11,.20)" },
};

const css = `
.messa-root{color:#f7f0df;font-family:'Satoshi',Inter,system-ui,sans-serif}
.messa-board{position:relative;min-height:440px;border:1px solid rgba(208,184,145,.22);border-radius:22px;overflow:hidden;background:radial-gradient(circle at 50% 45%,rgba(215,168,75,.08),transparent 50%),linear-gradient(135deg,#171512,#0d0c0b)}
.messa-board:before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:32px 32px;pointer-events:none}
.messa-table{position:absolute;transform:translate(-50%,-50%);width:122px;min-height:96px;padding:12px 10px;border:2px solid var(--tc);color:#fff;background:var(--tb);box-shadow:0 10px 28px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.16);cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;touch-action:none;user-select:none;transition:box-shadow .15s,filter .15s}
.messa-table:hover{filter:brightness(1.14);box-shadow:0 12px 34px rgba(0,0,0,.46),0 0 24px color-mix(in srgb,var(--tc) 28%,transparent)}
.messa-table.round{border-radius:999px;width:108px;height:108px}.messa-table.square{border-radius:18px}.messa-table.rectangle{width:150px;border-radius:18px}
.messa-table.is-editing{border-style:dashed;cursor:grab}.messa-table.is-dragging{cursor:grabbing;z-index:4;filter:brightness(1.2)}
.messa-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.messa-legend{display:flex;gap:12px;flex-wrap:wrap;color:#b9ad99;font-size:12px;font-weight:800}.messa-legend span{display:flex;align-items:center;gap:5px}.messa-dot{width:8px;height:8px;border-radius:50%}
.messa-btn{border:1px solid rgba(208,184,145,.25);border-radius:12px;background:rgba(255,255,255,.05);color:#f9f2e5;padding:10px 14px;font-weight:850;cursor:pointer}.messa-btn:hover{background:rgba(255,255,255,.09)}.messa-btn:disabled{opacity:.4;cursor:wait}
.messa-btn.primary{background:#E8341C;border-color:#E8341C;color:#fff}.messa-btn.gold{background:#d7a84b;border-color:#d7a84b;color:#211707}.messa-btn.green{background:#178447;border-color:#20a85d}.messa-btn.danger{color:#ff8f80;border-color:rgba(232,52,28,.55)}
.messa-overlay{position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.76);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:18px}
.messa-modal{width:min(760px,100%);max-height:92vh;overflow:auto;border:1px solid rgba(208,184,145,.28);border-radius:20px;background:#12110f;color:#f8f0df;box-shadow:0 26px 80px rgba(0,0,0,.68)}
.messa-modal-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:17px 20px;border-bottom:1px solid rgba(208,184,145,.18);background:rgba(18,17,15,.96);backdrop-filter:blur(14px)}
.messa-modal-body{padding:18px 20px 22px}.messa-close{width:38px;height:38px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:#fff;font-size:21px;cursor:pointer}
.messa-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:16px}.messa-stat{border:1px solid rgba(208,184,145,.17);border-radius:13px;padding:11px;background:rgba(255,255,255,.025)}.messa-stat small{display:block;color:#9f9380;font-size:10px;font-weight:800;text-transform:uppercase}.messa-stat strong{display:block;margin-top:4px;font-size:17px}
.messa-actions{display:flex;gap:8px;flex-wrap:wrap;margin:15px 0}.messa-section{margin-top:18px}.messa-section h3{margin:0 0 9px;color:#d9c8aa;font-size:12px;text-transform:uppercase;letter-spacing:.8px}
.messa-row{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.065);padding:9px 2px;font-size:13px}.messa-row:last-child{border-bottom:0}.messa-muted{color:#978d7c}.messa-chip{display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.13);border-radius:999px;padding:4px 8px;font-size:11px;font-weight:800;color:#ddd2bf}
.messa-input{width:100%;box-sizing:border-box;border:1px solid rgba(208,184,145,.28);border-radius:11px;background:#0b0b0a;color:#fff;padding:12px 13px;font:inherit;outline:none}.messa-input:focus{border-color:#d7a84b}
.messa-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.messa-label{display:block;color:#b9ad99;font-size:12px;font-weight:800;margin-bottom:6px}.messa-methods{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.messa-method{border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:11px 7px;background:rgba(255,255,255,.035);color:#fff;font-weight:850;cursor:pointer}.messa-method.active{border-color:var(--mc);box-shadow:inset 0 0 0 1px var(--mc);background:color-mix(in srgb,var(--mc) 18%,transparent)}
.messa-lines{max-height:260px;overflow:auto;border:1px solid rgba(208,184,145,.15);border-radius:12px;padding:4px 11px}.messa-line-check{display:grid;grid-template-columns:24px 1fr auto;align-items:center;gap:9px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer}.messa-line-check:last-child{border-bottom:0}.messa-line-check input{width:18px;height:18px;accent-color:#d7a84b}
.messa-banner{border:1px solid rgba(56,189,248,.35);border-radius:13px;padding:12px 14px;background:rgba(56,189,248,.09);color:#b9eaff;font-size:13px;line-height:1.45}.messa-error{border-color:rgba(232,52,28,.5);background:rgba(232,52,28,.1);color:#ffaaa0}
.messa-print-layer{display:none}.messa-print-sheet{width:58mm;margin:0 auto;color:#000;background:#fff;font:12px/1.35 'DM Mono',monospace}.messa-print-sheet h1,.messa-print-sheet h2,.messa-print-sheet p{margin:0}.messa-print-sheet .sep{border-top:1px dashed #000;margin:8px 0}.messa-print-row{display:flex;justify-content:space-between;gap:8px;margin:4px 0}.messa-print-row span:first-child{min-width:0;overflow-wrap:anywhere}.messa-print-total{font-size:18px;font-weight:900;text-align:right;margin:8px 0}.messa-print-center{text-align:center}.messa-print-small{font-size:10px}
@media(max-width:620px){.messa-board{min-height:520px}.messa-table{width:102px;min-height:88px}.messa-table.rectangle{width:124px}.messa-table.round{width:96px;height:96px}.messa-summary{grid-template-columns:1fr 1fr}.messa-form-grid{grid-template-columns:1fr}.messa-methods{grid-template-columns:1fr}.messa-modal-body{padding:15px}.messa-modal-head{padding:14px 15px}}
@media print{body *{visibility:hidden!important}.messa-print-layer,.messa-print-layer *{visibility:visible!important}.messa-print-layer{display:block!important;position:absolute;left:0;top:0;width:100%;background:#fff}.messa-print-sheet{display:block!important} @page{size:58mm auto;margin:3mm}}
`;

function Modal({ title, subtitle, onClose, children, width = 760 }) {
  return <div className="messa-overlay" role="dialog" aria-modal="true">
    <div className="messa-modal" style={{ width: `min(${width}px, 100%)` }}>
      <div className="messa-modal-head">
        <div><div style={{ fontWeight: 950, fontSize: 19 }}>{title}</div>{subtitle && <div className="messa-muted" style={{ fontSize: 12, marginTop: 2 }}>{subtitle}</div>}</div>
        <button className="messa-close" onClick={onClose} aria-label="Cerrar">×</button>
      </div>
      <div className="messa-modal-body">{children}</div>
    </div>
  </div>;
}

function equalShares(total, covers) {
  const cents = Math.max(0, Math.round(Number(total || 0) * 100));
  const count = Math.max(0, Math.floor(Number(covers || 0)));
  if (!cents || !count) return [];
  const base = Math.floor(cents / count);
  const extra = cents - (base * count);
  return Array.from({ length: count }, (_, index) => (base + (index < extra ? 1 : 0)) / 100);
}

function PrintPreview({ document, onClose }) {
  if (!document) return null;
  const rows = Array.isArray(document.rows) ? document.rows : [];
  return <Modal title="Vista previa" subtitle="Ticket no fiscal · 58 mm" onClose={onClose} width={500}>
    <div style={{ background: "#e8e8e8", padding: 18, borderRadius: 14 }}>
      <div className="messa-print-sheet" style={{ padding: "5mm", boxShadow: "0 6px 26px rgba(0,0,0,.2)" }}>
        <h1 className="messa-print-center" style={{ fontSize: 20 }}>LA DIECI</h1>
        <p className="messa-print-center" style={{ fontWeight: 900 }}>{document.title}</p>
        <p className="messa-print-center">MESA {document.tableNumber}</p>
        <div className="sep" />
        {rows.map((row, index) => <div className="messa-print-row" key={`${row.label}-${index}`}><span>{row.label}</span><strong>{row.value}</strong></div>)}
        <div className="sep" />
        {document.totalLabel && <div className="messa-print-total">{document.totalLabel} {euro(document.total)}</div>}
        {document.note && <p className="messa-print-center" style={{ marginTop: 8 }}>{document.note}</p>}
        <div className="sep" />
        <p className="messa-print-center messa-print-small">Documento no fiscal · {new Date().toLocaleString("es-ES")}</p>
      </div>
    </div>
    <div className="messa-actions" style={{ justifyContent: "flex-end" }}>
      <button className="messa-btn" onClick={onClose}>Cerrar</button>
      <button className="messa-btn gold" onClick={() => window.print()}>🖨 Imprimir</button>
    </div>
    <div className="messa-print-layer">
      <div className="messa-print-sheet" style={{ padding: "3mm" }}>
        <h1 className="messa-print-center" style={{ fontSize: 20 }}>LA DIECI</h1>
        <p className="messa-print-center" style={{ fontWeight: 900 }}>{document.title}</p>
        <p className="messa-print-center">MESA {document.tableNumber}</p><div className="sep" />
        {rows.map((row, index) => <div className="messa-print-row" key={`print-${row.label}-${index}`}><span>{row.label}</span><strong>{row.value}</strong></div>)}
        <div className="sep" />{document.totalLabel && <div className="messa-print-total">{document.totalLabel} {euro(document.total)}</div>}
        {document.note && <p className="messa-print-center" style={{ marginTop: 8 }}>{document.note}</p>}
        <div className="sep" /><p className="messa-print-center messa-print-small">Documento no fiscal · {new Date().toLocaleString("es-ES")}</p>
      </div>
    </div>
  </Modal>;
}

function PaymentModal({ table, mode, onClose, onPaid }) {
  const session = table.session;
  const availableLines = session.lines.filter((line) => Number(line.remaining) > 0);
  const [method, setMethod] = useState("efectivo");
  const [amount, setAmount] = useState(mode === "custom_amount" ? "" : String(session.nextEqualShare || ""));
  const [coversSettled, setCoversSettled] = useState(mode === "full" ? session.coversRemaining : 1);
  const [lineIds, setLineIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Stable across a network retry: if the first request committed but its reply
  // was lost, the backend replays the same transaction instead of charging twice.
  const requestIdRef = useRef(createMessaRequestId("pay"));
  const selectedTotal = availableLines.filter((line) => lineIds.includes(line.id)).reduce((sum, line) => sum + Number(line.remaining), 0);
  const displayedAmount = mode === "full" ? session.outstanding : mode === "equal_split" ? session.nextEqualShare : mode === "item_selection" ? selectedTotal : Number(amount || 0);
  const modeTitle = { full: "Cobrar cuenta completa", equal_split: "Pago a la romana", item_selection: "Cobrar productos", custom_amount: "Cobrar importe libre" }[mode];

  const submit = async () => {
    if (mode === "item_selection" && lineIds.length === 0) { setError("Selecciona al menos un producto."); return; }
    if (!(displayedAmount > 0) || displayedAmount > Number(session.outstanding) + 0.001) { setError("El importe no es válido."); return; }
    setBusy(true); setError("");
    try {
      const result = await messaApi.pay(session.id, {
        paymentMethod: method,
        mode,
        amount: mode === "custom_amount" ? Number(amount) : undefined,
        coversSettled: mode === "full" ? session.coversRemaining : Number(coversSettled),
        lineIds: mode === "item_selection" ? lineIds : undefined,
        clientRequestId: requestIdRef.current,
      });
      await onPaid(result, method);
    } catch (err) { setError(describeMessaError(err)); setBusy(false); }
  };

  return <Modal title={modeTitle} subtitle={`${table.name} · pendiente ${euro(session.outstanding)}`} onClose={busy ? undefined : onClose} width={610}>
    {mode === "equal_split" && <div className="messa-banner">Quedan <strong>{session.coversRemaining}</strong> personas. Esta cuota es de <strong>{euro(session.nextEqualShare)}</strong>; los céntimos se ajustan automáticamente en la última cuota.</div>}
    {mode === "item_selection" && <div className="messa-section"><h3>Productos pendientes</h3><div className="messa-lines">
      {availableLines.map((line) => <label className="messa-line-check" key={line.id}>
        <input type="checkbox" checked={lineIds.includes(line.id)} onChange={(event) => setLineIds((current) => event.target.checked ? [...current, line.id] : current.filter((id) => id !== line.id))} />
        <span>{line.description}</span><strong>{euro(line.remaining)}</strong>
      </label>)}
    </div></div>}
    {mode === "custom_amount" && <div className="messa-section"><label className="messa-label">Importe a cobrar</label><input className="messa-input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(",", "."))} placeholder="0,00" /></div>}
    {(mode === "item_selection" || mode === "custom_amount") && <div className="messa-section"><label className="messa-label">Personas que quedan saldadas con este pago</label><input className="messa-input" type="number" min="0" max={session.coversRemaining} value={coversSettled} onChange={(event) => setCoversSettled(event.target.value)} /></div>}
    <div className="messa-section"><h3>Método de este pago</h3><div className="messa-methods">{METHODS.map((item) => <button key={item.id} className={`messa-method ${method === item.id ? "active" : ""}`} style={{ "--mc": item.color }} onClick={() => setMethod(item.id)}>{item.icon} {item.label}</button>)}</div></div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 18 }}><div><span className="messa-muted">A cobrar</span><div style={{ fontSize: 24, fontWeight: 950 }}>{euro(displayedAmount)}</div></div><button className="messa-btn green" disabled={busy} onClick={submit}>{busy ? "Registrando…" : "Confirmar cobro"}</button></div>
    {error && <div className="messa-banner messa-error" style={{ marginTop: 12 }}>{error}</div>}
  </Modal>;
}

function TableDetail({ table, onClose, onNewCommand, onRefresh, onPrint }) {
  const [paymentMode, setPaymentMode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const session = table.session;
  const shares = equalShares(session?.outstanding, session?.coversRemaining);
  const remainingLines = (session?.lines || []).filter((line) => Number(line.remaining) > 0);
  const paymentTotals = Object.entries(session?.paymentTotals || {}).filter(([, amount]) => Number(amount) !== 0);

  const billDocument = () => ({
    title: "CUENTA CLIENTE", tableNumber: table.number,
    rows: [
      ...remainingLines.map((line) => ({ label: line.description, value: euro(line.remaining) })),
      ...(paymentTotals.length ? [{ label: "Ya cobrado", value: euro(session.paid) }] : []),
    ],
    totalLabel: "PENDIENTE", total: session.outstanding,
    note: session.paid > 0 ? "Incluye únicamente lo que queda por pagar." : "Cuenta completa de la mesa.",
  });
  const splitDocument = () => ({
    title: "DIVISIÓN A LA ROMANA", tableNumber: table.number,
    rows: shares.map((share, index) => ({ label: `Persona ${index + 1}`, value: euro(share) })),
    totalLabel: "PENDIENTE", total: session.outstanding,
    note: `${session.coversRemaining} persona${session.coversRemaining === 1 ? "" : "s"} pendiente${session.coversRemaining === 1 ? "" : "s"}`,
  });
  const paid = async (result, method) => {
    const outstandingAfter = result.outstandingAfter == null
      ? Math.max(0, Math.round((Number(session.outstanding) - Number(result.amount)) * 100) / 100)
      : Number(result.outstandingAfter);
    setPaymentMode(null);
    onPrint({
      title: "RECIBO DE PAGO", tableNumber: table.number,
      rows: [
        { label: "Importe cobrado", value: euro(result.amount) },
        { label: "Método", value: METHODS.find((item) => item.id === method)?.label || method },
        { label: "Queda por pagar", value: euro(outstandingAfter) },
      ],
      totalLabel: "PAGADO", total: result.amount,
      note: outstandingAfter === 0 ? "Cuenta cerrada." : "Pago parcial registrado.",
    });
    await onRefresh();
  };
  const markServed = async (orderId) => {
    setBusy(true); setError("");
    try { await messaApi.markServed(session.id, orderId); await onRefresh(); }
    catch (err) { setError(describeMessaError(err)); }
    finally { setBusy(false); }
  };

  return <>
    <Modal title={`Mesa ${table.number}`} subtitle={`${STATUS[table.status].label} · ${session.coversTotal} cubiertos`} onClose={onClose}>
      <div className="messa-summary">
        <div className="messa-stat"><small>Total</small><strong>{euro(session.total)}</strong></div>
        <div className="messa-stat"><small>Cobrado</small><strong style={{ color: "#65d995" }}>{euro(session.paid)}</strong></div>
        <div className="messa-stat"><small>Pendiente</small><strong style={{ color: "#ffc65c" }}>{euro(session.outstanding)}</strong></div>
        <div className="messa-stat"><small>Personas</small><strong>{session.coversRemaining}/{session.coversTotal}</strong></div>
      </div>

      {table.status === "open" && <>
        <div className="messa-actions">
          <button className="messa-btn primary" onClick={() => { onClose(); onNewCommand(table); }}>＋ Nueva comanda</button>
          {session.outstanding > 0 && <button className="messa-btn green" onClick={() => setPaymentMode("full")}>Cobrar todo</button>}
          {session.outstanding > 0 && session.coversRemaining > 0 && <button className="messa-btn" onClick={() => setPaymentMode("equal_split")}>A la romana · {euro(session.nextEqualShare)}</button>}
          {remainingLines.length > 0 && <button className="messa-btn" onClick={() => setPaymentMode("item_selection")}>Elegir productos</button>}
          {session.outstanding > 0 && <button className="messa-btn" onClick={() => setPaymentMode("custom_amount")}>Importe libre</button>}
        </div>
        <div className="messa-actions">
          {session.outstanding > 0 && <button className="messa-btn gold" onClick={() => onPrint(billDocument())}>🖨 Cuenta pendiente</button>}
          {shares.length > 0 && <button className="messa-btn" onClick={() => onPrint(splitDocument())}>🖨 Imprimir división</button>}
        </div>
      </>}
      {paymentTotals.length > 0 && <div className="messa-section"><h3>Cobrado por método</h3>{paymentTotals.map(([method, amount]) => <div className="messa-row" key={method}><span>{METHODS.find((item) => item.id === method)?.label || method}</span><strong>{euro(amount)}</strong></div>)}</div>}
      <div className="messa-section"><h3>Comandas de cocina</h3>{session.commands.length === 0 ? <div className="messa-muted">Todavía no hay comandas.</div> : session.commands.map((command) => <div className="messa-row" key={command.id}><div><strong>Comanda {command.commandNumber}</strong><div className="messa-muted">{command.items.reduce((sum, item) => sum + (Number(item.q) || 1), 0)} productos · {command.time || "ahora"}</div></div><div style={{ display: "flex", alignItems: "center", gap: 7 }}><span className="messa-chip">{command.state === "LISTO" ? "LISTA PARA SERVIR" : command.state === "RETIRADO" ? "SERVIDA" : command.state}</span>{command.state === "LISTO" && <button className="messa-btn green" disabled={busy} onClick={() => markServed(command.id)}>✓ Servida</button>}</div></div>)}</div>
      {remainingLines.length > 0 && <div className="messa-section"><h3>Pendiente de pago</h3>{remainingLines.map((line) => <div className="messa-row" key={line.id}><span>{line.description}</span><strong>{euro(line.remaining)}</strong></div>)}</div>}
      {error && <div className="messa-banner messa-error" style={{ marginTop: 12 }}>{error}</div>}
    </Modal>
    {paymentMode && <PaymentModal table={table} mode={paymentMode} onClose={() => setPaymentMode(null)} onPaid={paid} />}
  </>;
}

function OpenTableModal({ table, onClose, onOpened }) {
  const [covers, setCovers] = useState(table.capacity || 2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = async () => {
    const count = Number(covers);
    if (!Number.isInteger(count) || count < 1 || count > 99) { setError("Indica un número de cubiertos válido."); return; }
    setBusy(true); setError("");
    try { await messaApi.openTable(table.id, count); await onOpened(table.id); }
    catch (err) { setError(describeMessaError(err)); setBusy(false); }
  };
  return <Modal title={`Abrir Mesa ${table.number}`} subtitle="La cuenta quedará abierta hasta el pago completo" onClose={busy ? undefined : onClose} width={430}>
    <label className="messa-label">Número de cubiertos</label><input className="messa-input" type="number" min="1" max="99" value={covers} onChange={(event) => setCovers(event.target.value)} autoFocus />
    <div className="messa-actions" style={{ justifyContent: "flex-end" }}><button className="messa-btn" onClick={onClose}>Cancelar</button><button className="messa-btn primary" disabled={busy} onClick={open}>{busy ? "Abriendo…" : "Abrir mesa"}</button></div>
    {error && <div className="messa-banner messa-error">{error}</div>}
  </Modal>;
}

function AddTableModal({ tables, onClose, onSaved }) {
  const nextNumber = Math.max(0, ...tables.map((table) => Number(table.number) || 0)) + 1;
  const [form, setForm] = useState({ tableNumber: nextNumber, displayName: `Mesa ${nextNumber}`, capacity: 4, shape: "square" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true); setError("");
    try {
      await messaApi.saveTable("new", { ...form, tableNumber: Number(form.tableNumber), capacity: Number(form.capacity), positionX: 50, positionY: 50, active: true });
      await onSaved(); onClose();
    } catch (err) { setError(describeMessaError(err)); setBusy(false); }
  };
  return <Modal title="Añadir mesa" subtitle="Después podrás moverla en el plano" onClose={busy ? undefined : onClose} width={520}>
    <div className="messa-form-grid"><div><label className="messa-label">Número</label><input className="messa-input" type="number" value={form.tableNumber} onChange={(event) => setForm({ ...form, tableNumber: event.target.value, displayName: `Mesa ${event.target.value}` })} /></div><div><label className="messa-label">Cubiertos habituales</label><input className="messa-input" type="number" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} /></div><div><label className="messa-label">Nombre</label><input className="messa-input" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></div><div><label className="messa-label">Forma</label><select className="messa-input" value={form.shape} onChange={(event) => setForm({ ...form, shape: event.target.value })}><option value="round">Redonda</option><option value="square">Cuadrada</option><option value="rectangle">Rectangular</option></select></div></div>
    <div className="messa-actions" style={{ justifyContent: "flex-end" }}><button className="messa-btn" onClick={onClose}>Cancelar</button><button className="messa-btn gold" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Añadir"}</button></div>{error && <div className="messa-banner messa-error">{error}</div>}
  </Modal>;
}

export default function TabMessa({ role, notify, onNewCommand, onCountChange, refreshKey = 0 }) {
  const canEdit = role === "admin" || role === "owner";
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [printDocument, setPrintDocument] = useState(null);
  const boardRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const result = await messaApi.floor({ includeInactive: canEdit });
      setTables(result.tables || []); setError("");
      onCountChange?.((result.tables || []).filter((table) => table.active && table.status !== "free").length);
    } catch (err) { setError(describeMessaError(err)); }
    finally { if (!quiet) setLoading(false); }
  }, [canEdit, onCountChange]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { const timer = setInterval(() => load({ quiet: true }), 10000); return () => clearInterval(timer); }, [load]);

  const selected = tables.find((table) => table.id === selectedId && table.active) || null;
  const opening = tables.find((table) => table.id === openingId && table.active) || null;
  const activeTables = tables.filter((table) => table.active);

  const savePosition = async (table) => {
    try {
      await messaApi.saveTable(table.id, { tableNumber: table.number, displayName: table.name, capacity: table.capacity, positionX: table.x, positionY: table.y, shape: table.shape, active: true });
    } catch (err) { notify?.(`❌ ${describeMessaError(err)}`, C.rosso); await load({ quiet: true }); }
  };
  const pointerDown = (event, table) => {
    if (!editing) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { id: table.id, pointerId: event.pointerId, moved: false, table };
  };
  const pointerMove = (event) => {
    const drag = dragRef.current;
    const board = boardRef.current;
    if (!drag || !board || drag.pointerId !== event.pointerId) return;
    const rect = board.getBoundingClientRect();
    const x = Math.max(7, Math.min(93, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(10, Math.min(90, ((event.clientY - rect.top) / rect.height) * 100));
    dragRef.current = { ...drag, moved: true, table: { ...drag.table, x, y } };
    setTables((current) => current.map((table) => table.id === drag.id ? { ...table, x, y } : table));
  };
  const pointerUp = async (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.moved) {
      suppressClickRef.current = drag.id;
      window.setTimeout(() => { if (suppressClickRef.current === drag.id) suppressClickRef.current = null; }, 250);
      await savePosition(drag.table);
    }
  };
  const deactivate = async (table) => {
    if (!window.confirm(`¿Quitar ${table.name} del plano? El historial se conservará.`)) return;
    try { await messaApi.saveTable(table.id, { tableNumber: table.number, displayName: table.name, capacity: table.capacity, positionX: table.x, positionY: table.y, shape: table.shape, active: false }); await load(); }
    catch (err) { notify?.(`❌ ${describeMessaError(err)}`, C.rosso); }
  };

  if (loading) return <div className="messa-root"><style>{css}</style><div className="messa-banner">Cargando el plano de mesas…</div></div>;
  if (error && tables.length === 0) return <div className="messa-root"><style>{css}</style><div className="messa-banner messa-error">{error}</div><button className="messa-btn" style={{ marginTop: 10 }} onClick={() => load()}>Reintentar</button></div>;

  return <div className="messa-root"><style>{css}</style>
    <div className="messa-toolbar"><div className="messa-legend">{Object.entries(STATUS).map(([id, item]) => <span key={id}><i className="messa-dot" style={{ background: item.color }} />{item.label}</span>)}</div><div style={{ display: "flex", gap: 8 }}>{canEdit && editing && <button className="messa-btn gold" onClick={() => setShowAdd(true)}>＋ Añadir mesa</button>}{canEdit && <button className={`messa-btn ${editing ? "primary" : ""}`} onClick={() => setEditing((value) => !value)}>{editing ? "✓ Terminar plano" : "✥ Editar plano"}</button>}<button className="messa-btn" onClick={() => load()}>↻</button></div></div>
    {editing && <div className="messa-banner" style={{ marginBottom: 11 }}>Arrastra cada mesa hasta su posición real. Para quitar una, tócala y usa el botón rojo.</div>}
    <div className="messa-board" ref={boardRef} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
      {activeTables.map((table) => { const state = STATUS[table.status] || STATUS.free; const dragging = dragRef.current?.id === table.id; return <button key={table.id} className={`messa-table ${table.shape} ${editing ? "is-editing" : ""} ${dragging ? "is-dragging" : ""}`} style={{ left: `${table.x}%`, top: `${table.y}%`, "--tc": state.color, "--tb": state.bg }} onPointerDown={(event) => pointerDown(event, table)} onClick={() => { if (suppressClickRef.current === table.id) { suppressClickRef.current = null; return; } if (editing) { deactivate(table); return; } if (table.status === "free") setOpeningId(table.id); else setSelectedId(table.id); }}>
        <span style={{ fontSize: 12, color: state.color, fontWeight: 900 }}>{state.label}</span><strong style={{ fontSize: 19 }}>Mesa {table.number}</strong>{table.status === "open" && <><span style={{ fontSize: 13, fontWeight: 900 }}>{euro(table.session.outstanding)}</span><span style={{ fontSize: 11, color: "#dfd5c4" }}>👥 {table.session.coversRemaining}/{table.session.coversTotal}</span></>}{table.status === "free" && <span style={{ fontSize: 11, color: "#d8cebd" }}>hasta {table.capacity || "—"} cubiertos</span>}
      </button>; })}
    </div>
    {error && <div className="messa-banner messa-error" style={{ marginTop: 10 }}>{error}</div>}
    {opening && <OpenTableModal table={opening} onClose={() => setOpeningId(null)} onOpened={async (tableId) => { await load(); setOpeningId(null); setSelectedId(tableId); }} />}
    {selected?.status === "open" && <TableDetail table={selected} onClose={() => setSelectedId(null)} onNewCommand={onNewCommand} onRefresh={() => load({ quiet: true })} onPrint={setPrintDocument} />}
    {showAdd && <AddTableModal tables={tables} onClose={() => setShowAdd(false)} onSaved={() => load()} />}
    {printDocument && <PrintPreview document={printDocument} onClose={() => setPrintDocument(null)} />}
  </div>;
}

export { equalShares };

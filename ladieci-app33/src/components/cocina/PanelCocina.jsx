import { useState, useEffect } from 'react';
import { C, tot, MAX_PIZZE_ORA, LOGO_RED_SRC, useWidth } from '../../constants';
import { caricoTotale, lookupMenu, calcTimer, FASE_CONFIG, notaCucina } from '../ordenes/TabListos';
import { ZONE_DELIVERY, tempoAndata } from '../../zones';
import PriorityControl from '../ui/PriorityControl';
import { KitchenVisualStyles, zoneMeta } from './kitchenVisual';
import { KitchenBlock, CardIdentity, ItemRow } from './PizzeriaBlocks';
import { packKitchenSegments } from './kitchenPacking';
import { api } from '../../api';
import { isDessertPizza } from '../../menu/dessertPizza';
import {
  buildManualGiroMetaById,
  getManualGiroForOrder,
  formatManualGiroLabel,
  deadlineState,
  orderDeadlineMs,
  sortKitchenCards,
  groupKitchenSegments
} from './manualGiroCocina';

const PICKUP_INK = "#0369A1";

const subtractMinutes = (hora, min) => {
  if (!hora || !min) return null;
  const [hh, mm] = hora.split(":").map(Number);
  const tot = hh * 60 + mm - min;
  if (tot < 0) return null;
  return `${String(Math.floor(tot/60)%24).padStart(2,"0")}:${String(tot % 60).padStart(2,"0")}`;
};

const PanelCocina = ({ordenes, convConfermata=[], onListo, onClose, loadingIds=new Set(), pizzeFatte=0}) => {
  const [now, setNow] = useState(Date.now());
  const [manualGiros, setManualGiros] = useState([]);
  // Override locale ottimistico per ui_offset_min — il polling/WS poi sincronizza
  const [localOffsets, setLocalOffsets] = useState({});
  // [FDV1] offset di un membro di giro = tutto il blocco (il backend scrive tutti i membri)
  const handleOffsetChange = (id, val) => {
    const gid = (ordenes.find(x => x.id === id) || {}).manual_giro_id;
    const ids = gid ? ordenes.filter(x => x.manual_giro_id === gid).map(x => x.id) : [id];
    setLocalOffsets(prev => { const n = { ...prev }; const at = Date.now(); for (const k of ids) n[k] = { v: val, at }; return n; });
  };
  useEffect(()=>{
    const i = setInterval(()=>setNow(Date.now()),1000);
    return()=>clearInterval(i);
  },[]);
  useEffect(() => {
    let mounted = true;
    const safeLoad = async () => {
      try {
        const res = await api.getManualGiros();
        if (!mounted) return;
        if (Array.isArray(res)) setManualGiros(res);
        else if (res && res.error) console.warn("[panel cocina manualGiros] fetch error:", res.error);
      } catch (e) {
        console.warn("[panel cocina manualGiros] fetch threw:", (e && e.message) || e);
      }
    };
    safeLoad();
    const poll = setInterval(safeLoad, 10000);
    return () => { mounted = false; clearInterval(poll); };
  }, []);
  const w = useWidth();
  const cols = w >= 680 ? 3 : w >= 420 ? 2 : 1;

  const totPizze = caricoTotale(ordenes);
  const pctCarico = Math.min(100, Math.round((totPizze / MAX_PIZZE_ORA) * 100));
  const caricoColor = pctCarico >= 90 ? "#C0392B" : pctCarico >= 65 ? "#E67E22" : "#27AE60";
  const caricoLabel = pctCarico >= 90 ? "FORNO SATURO" : pctCarico >= 65 ? "Cargado" : "Ok";

  // Pizzeria = solo pizze da forno (Pizzas + pizze dolci). Cocina, Bebidas e
  // Postres non pizza restano nella scheda Cocina, che vede l'ordine completo
  // ed è l'unica a portarlo a LISTO.
  const isPizzaForno = (it) => {
    const mi = lookupMenu(it);
    const cat = it.cat || mi?.cat || "Pizzas";
    if (cat === "Postres") return isDessertPizza(it);
    return cat === "Pizzas";
  };
  const manualGiroMetaById = buildManualGiroMetaById(manualGiros);

  const activosBase = ordenes
    .filter(o => o.estado==="EN_COCINA")
    .map(o => {
      // Applica override ottimistico ui_offset_min (se presente, sovrascrive il valore polled)
      // override ottimistico breve (8 s): poi vince il valore sincronizzato (offset di blocco allineati dal backend)
      const lo = localOffsets[o.id];
      if (lo && now - lo.at < 8000) {
        o = { ...o, ui_offset_min: lo.v };
      }
      const all = (o.items||[]).filter(it => it.n !== "Entrega a domicilio");
      const items = all.filter(isPizzaForno);
      const isDelivery = o.tipo_consegna === "DOMICILIO";
      const zonaObj = isDelivery ? ZONE_DELIVERY.find(z => z.id === o.zona) : null;
      const manualGiro = getManualGiroForOrder(o, manualGiroMetaById);
      // Sorgente unica: o.forno_out (backend cascade-aware). Fallback legacy per ordini pre-migration.
      const horaFornoBase = o.forno_out
        || (isDelivery && zonaObj && o.hora ? subtractMinutes(o.hora, tempoAndata(o, zonaObj)) : (o.hora || null));
      // [FDV1] DOMICILIO: UN solo riferimento temporale = delivery_deadline_at; il ± cambia solo l'ordine. RITIRO invariato.
      const horaForno = isDelivery ? null : horaFornoBase;
      const oPerTimer = horaForno ? {...o, hora: horaForno} : o;
      return {
        ...o,
        items,
        isDelivery, horaForno, manualGiro,
        dl: isDelivery ? deadlineState(o, now) : null,
        _timer: isDelivery ? null : calcTimer(oPerTimer, now)
      };
    })
    .filter(o => o.items.length > 0);

  // [FDV1] A5: giro = blocco atomico anche nell'ordinamento
  const activos = sortKitchenCards(activosBase, now);

  // [FDV1 R3] Corpo della card: gerarchia tipografica pensata per essere letta DA LONTANO, non col naso
  // sul monitor. Per ogni prodotto una sola riga d'attacco:
  //     [×2]   PROSCIUTTO   Divino Codino
  // — badge quantità grande, nel colore del blocco/zona (lo stesso colpo d'occhio del contenitore);
  // — NOME PIZZA grande e MAIUSCOLO: è l'informazione che il pizzaiolo cerca;
  // — alias commerciale piccolo e secondario, accanto, senza rubare la riga;
  // — ingredienti subito sotto, compatti (2 righe max): servono al controllo, non alla ricerca.
  const renderBody = (o, fc, accent = "#374151") => {
    const notaVisibile = notaCucina(o.nota);
    const notaCucinaOp = o.nota_cucina ? String(o.nota_cucina).trim() : "";
    const compact = o.items.length >= 4;
    // colonna stretta (tablet verticale, 3 colonne sotto 960px): nome e badge scalano per non spezzare le parole
    const narrow = cols >= 3 && w < 960;
    return (
      <div style={{ padding: "7px 9px 8px", display: "flex", flexDirection: "column", gap: compact ? 6 : 8, background: "#fff" }}>
        {o.items.map((it, i) => {
          const mi = lookupMenu(it);
          const alias = it.n || "";                       // nome commerciale (El Pelusa, Divino Codino…)
          const pizza = (mi?.sub || alias || "").trim();  // nome pizza vero (Margherita, Prosciutto…)
          const mostraAlias = alias && alias.toUpperCase() !== pizza.toUpperCase();
          return (
            <ItemRow key={i} qty={it.q} name={pizza} alias={mostraAlias ? alias : ""}
              ing={mi?.ing || it.ing || ""} variant={it.sub || ""} accent={accent}
              compact={compact} narrow={narrow} divider={i > 0 ? `${fc.border}44` : null} />
          );
        })}
        {notaCucinaOp && (
          <div style={{ background: "#E8341C", borderRadius: 7, padding: "5px 9px", color: "#fff", fontSize: 13, fontWeight: 900 }}>
            🍕 {notaCucinaOp}
          </div>
        )}
        {notaVisibile && (
          <div style={{ background: "rgba(232,52,28,0.12)", border: "1.5px solid rgba(232,52,28,0.45)", borderRadius: 7,
            padding: "5px 9px", color: "#C0271A", fontSize: 12, fontWeight: 800 }}>
            ⚠ {notaVisibile}
          </div>
        )}
      </div>
    );
  };

  // [FDV1 R3] renderLegacyCard rimosso: in Pizzeria ogni ordine vive dentro un blocco
  //   (DOMICILIO = blocco zona/giro, RITIRO = blocco "Recogida en local").

  // Bottone LISTO per-card (ordine singolo o membro di un GIRO): usa la stessa transizione
  // canonica EN_COCINA→LISTO già cablata da Cocina (onListo → setListo → api.updateEstado).
  // Nessuna nuova logica: solo il rendering mancante nel pannello Pizzeria.
  const renderListoButton = (o) => {
    const busy = loadingIds.has(o.id);
    return (
      <button
        key="listo"
        data-testid="pizzeria-listo"
        onClick={() => { if (busy) return; onListo(o.id, { origin: "PanelCocina", actor: "pizzeria" }); }}
        disabled={busy}
        style={{
          width: "100%", background: busy ? "rgba(39,174,96,0.35)" : "linear-gradient(145deg,#27AE60,#1A7A44)",
          border: "none", color: "#fff", borderRadius: 10, padding: "13px 0", minHeight: 48,
          fontWeight: 900, fontSize: 16, letterSpacing: .4,
          cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? "Confirmando…" : "✅ LISTO"}
      </button>
    );
  };

  // [FDV1 R3] card DOMICILIO DENTRO il blocco: l'orario grande sta nell'header del blocco (§10), qui restano
  // identità, zona (quando il blocco è misto) e il proprio límite solo se diverso da quello del blocco.
  const renderDeliveryCard = (o, { blockMs = null, showZone = false, accent = null } = {}) => {
    const zone = zoneMeta(o);
    const fcNeutral = { border: "#9CA3AF" };
    return (
      <div key={o.id} data-testid="kitchen-card" data-zone={zone.id} data-state={(o.dl && o.dl.state) || "normal"} style={{
        background: "#fff", borderRadius: 11, overflow: "hidden", display: "flex", flexDirection: "column",
        border: "1.5px solid #D1D5DB", borderLeft: `9px solid ${zone.color}`, boxShadow: "0 1px 5px rgba(0,0,0,0.09)", minWidth: 0
      }}>
        <CardIdentity o={o} zone={zone} blockMs={blockMs} showZone={showZone} />
        {renderBody(o, fcNeutral, accent || zone.color)}
        <div style={{ padding: "0 9px 9px" }}>{renderListoButton(o)}</div>
      </div>
    );
  };

  // [FDV1 R3 §12] RITIRO: il cliente viene al locale — nessun countdown di entrega. Resta l'orario di
  // preparación/recogida (comportamento Pizzeria invariato), dentro il contenitore "Recogida en local".
  const renderPickupCard = (o) => {
    const t = o._timer;
    const fc = FASE_CONFIG[t && t.fase] || FASE_CONFIG.espera;
    const timerStr = t ? `${t.scaduto && t.conOrario ? "-" : ""}${String(t.mm).padStart(2, "0")}:${String(t.ss).padStart(2, "0")}` : "";
    return (
      <div key={o.id} data-testid="kitchen-card" data-pickup="1" style={{
        background: "#fff", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column",
        border: "1.5px solid #D1D5DB", borderLeft: `10px solid ${PICKUP_INK}`, boxShadow: "0 1px 6px rgba(0,0,0,0.10)", minWidth: 0
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 10px", background: "#fff", borderBottom: "1px solid #E5E7EB" }}>
          <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 900, fontSize: 18, color: "#111827" }}>{o.id}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#4B5563", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>{o.nombre || ""}</span>
          <span style={{ flex: 1, minWidth: 4 }} />
          {t && t.showCountdown && (
            <span data-testid="pickup-prep" title={t.conOrario ? "Tiempo hasta la recogida" : "Desde la orden"} style={{
              fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 900, color: fc.textLight,
              background: "#F1F5F9", borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap",
            }}>{timerStr}</span>
          )}
        </div>
        {renderBody(o, fc, PICKUP_INK)}
        <div style={{ padding: "0 9px 9px" }}>{renderListoButton(o)}</div>
      </div>
    );
  };

  // etichetta del giro nell'header del blocco: "GIRO G3" (seq/id), "GIRO" se non ricavabile
  const giroTag = (c, gid) => {
    const l = formatManualGiroLabel((c && c.manualGiro) || { id: gid });
    return l === "G?" ? "GIRO" : `GIRO ${l}`;
  };

  const nowStr = new Date(now).toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"});
  const dateStr = new Date(now).toLocaleDateString("es",{weekday:"short",day:"numeric",month:"short"});

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:800,
      background:"#fff",
      display:"flex", flexDirection:"column",
      animation:"fadeIn .2s ease",
      fontFamily:"'Satoshi',-apple-system,sans-serif",
      paddingTop:"env(safe-area-inset-top)",
      paddingBottom:"env(safe-area-inset-bottom)"
    }}>
      {/* [FDV1 R3] Barra superiore su UNA riga: logo · carico · orologio · stato forno · hechas · chiudi.
          Meno altezza sprecata = più ordini visibili senza scorrere. Nessun contatore per zona, nessun
          pannello analitico nuovo: sono le stesse informazioni di prima, su una linea sola. */}
      <div style={{
        background:"#fff", borderBottom:"1.5px solid #e8e8e8", padding:"6px 14px",
        display:"flex", alignItems:"center", gap:14, flexShrink:0, minHeight:52,
      }}>
        <div style={{width:34,height:34,borderRadius:9,flexShrink:0,background:"#0A0A0A",
          border:"1.5px solid rgba(232,52,28,0.8)", boxShadow:"0 0 10px rgba(232,52,28,0.35)",
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          <img src={LOGO_RED_SRC} alt="" style={{width:"115%",height:"115%",objectFit:"contain",
            filter:"brightness(1.3) contrast(1.2) saturate(1.25)"}}/>
        </div>

        <div style={{fontSize:18,fontWeight:800,color:"#111",lineHeight:1,whiteSpace:"nowrap"}}>
          {activos.length === 0
            ? <span style={{color:"#27AE60"}}>Todo listo ✓</span>
            : <span><span style={{fontFamily:"'DM Mono',monospace",fontWeight:900}}>{activos.length}</span> pedido{activos.length!==1?"s":""} · <span style={{fontFamily:"'DM Mono',monospace",fontWeight:900}}>{totPizze}</span> pizza{totPizze!==1?"s":""}</span>
          }
        </div>

        <span style={{width:1,height:24,background:"#ececec",flexShrink:0}} />

        <div style={{fontFamily:"'DM Mono',monospace",fontSize:24,fontWeight:900,color:"#111",lineHeight:1,whiteSpace:"nowrap"}}>
          {nowStr}
        </div>
        <div style={{fontSize:11,color:"#b0b0b0",letterSpacing:.3,textTransform:"capitalize",whiteSpace:"nowrap"}}>
          {dateStr}
        </div>

        <span style={{flex:1,minWidth:8}} />

        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <div style={{width:110,height:6,background:"#f0f0f0",borderRadius:3,overflow:"hidden"}}>
            <div style={{width:`${pctCarico}%`,height:"100%",background:caricoColor,borderRadius:3,transition:"width .4s ease"}}/>
          </div>
          <span style={{fontSize:12,fontWeight:800,color:caricoColor,whiteSpace:"nowrap"}}>
            {pctCarico}% · {caricoLabel}
          </span>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:7,background:"#0A0A0A",
          border:"1.5px solid rgba(232,52,28,0.5)",borderRadius:8,padding:"4px 10px",flexShrink:0}}>
          <span style={{fontSize:9,fontWeight:800,letterSpacing:1.4,textTransform:"uppercase",color:"rgba(255,255,255,0.45)"}}>🍕 Hechas</span>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:18,fontWeight:900,color:"#fff",lineHeight:1,
            textShadow:"0 0 8px rgba(232,52,28,0.7)"}}>{pizzeFatte}</span>
        </div>

        <button onClick={onClose} aria-label="Cerrar pizzeria" style={{
          background:"#f4f4f4",border:"1px solid #e0e0e0",color:"#666",borderRadius:"50%",
          width:32,height:32,fontSize:15,fontWeight:700,flexShrink:0,
          display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>✕</button>
      </div>

      {/* Content */}
      <div style={{flex:1,overflowY:"auto",padding:"12px 12px 28px"}}>
        {activos.length === 0 ? (
          <div style={{display:"flex",flexDirection:"column",
            alignItems:"center",justifyContent:"center",height:320,gap:14}}>
            <div style={{fontSize:72}}>✅</div>
            <div style={{fontSize:24,fontWeight:900,color:"#2D6A2D"}}>Cocina al día</div>
            <div style={{fontSize:15,color:"#555"}}>Sin pedidos pendientes</div>
          </div>
        ) : (
          <div data-testid="pizzeria-grid" style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:12,alignItems:"stretch"}}>
            <KitchenVisualStyles />
            {packKitchenSegments(groupKitchenSegments(activos), cols).map(({ seg, width }) => {
              const cards = seg.type === "giro" ? seg.cards : [seg.card];
              const isPickup = cards.every((c) => c.tipo_consegna !== "DOMICILIO");
              const key = seg.type === "giro" ? "g:" + seg.giroId : "o:" + seg.card.id;
              if (isPickup) {
                return (
                  <KitchenBlock key={key} cards={cards} width={width} cols={cols} nowMs={now}
                    pickupHora={cards[0].horaForno || cards[0].hora || null}>
                    {cards.map(renderPickupCard)}
                  </KitchenBlock>
                );
              }
              const blockMs = Math.min(...cards.map(orderDeadlineMs).filter(Number.isFinite));
              const zones = new Set(cards.map((c) => zoneMeta(c).id));
              // badge quantità = colore del blocco quando la zona è unica (stesso colpo d'occhio del contenitore);
              // blocco misto → ogni card usa la PROPRIA zona, così non si inventa un'appartenenza sbagliata.
              const blockAccent = zoneMeta(cards[0]).color;
              return (
                <KitchenBlock key={key} cards={cards} width={width} cols={cols} nowMs={now}
                  giroId={seg.type === "giro" ? seg.giroId : null}
                  giroLabel={seg.type === "giro" ? giroTag(cards[0], seg.giroId) : null}
                  control={<PriorityControl orden={cards[0]} windowOrders={cards} onUpdate={handleOffsetChange} light={false} nowMs={now} />}>
                  {cards.map((o) => renderDeliveryCard(o, {
                    blockMs: Number.isFinite(blockMs) ? blockMs : null,
                    showZone: zones.size > 1,
                    accent: zones.size > 1 ? zoneMeta(o).color : blockAccent,
                  }))}
                </KitchenBlock>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── TAB COCINA KDS (in-tab) ──────────────────────────────────

export default PanelCocina;

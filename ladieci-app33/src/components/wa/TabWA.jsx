import { useState, useEffect, useCallback, useMemo } from 'react';
import { C, useWidth } from '../../constants';
import WaLista from './WaLista';
import WADettaglio from './WADettaglio';
import TabPreguntas from './TabPreguntas';
import Badge from '../ui/Badge';

const TabWA = ({msgsOrdini, msgsPreguntas, allMsgs, ordenes, onConfirm, onManual, onElimina, onRispondi, onCreaOrdenFromChat, onAddicion, onConfirmaDaConfermare, initialSel, onUpdateIaItems, onNuevoPedido, goToPedidosSignal, onMoveToNuevo, onMoveToPreguntas, goToPreguntasSignal}) => {
  const w = useWidth();
  const isTablet = w >= 768;
  const [subTab, setSubTab] = useState("ordenes");

  // Switcha a Pedidos quando arriva il segnale da Preguntas
  useEffect(() => {
    if (goToPedidosSignal) setSubTab("ordenes");
  }, [goToPedidosSignal]);

  // Switcha a Preguntas quando arriva il segnale da Pedidos
  useEffect(() => {
    if (goToPreguntasSignal) { setSubTab("preguntas"); setSel(null); }
  }, [goToPreguntasSignal]);
  const [sel, setSel] = useState(null);

  // Preseleziona un messaggio quando si arriva da Listos (chat storico)
  useEffect(() => {
    if (initialSel) {
      setSel(initialSel);
    }
  }, [initialSel]);

  // Stable: selMsg derived without triggering remounts (cerca anche in allMsgs per i COMPLETATO)
  const selMsg = useMemo(() => msgsOrdini.find(m=>m.id===sel) || allMsgs.find(m=>m.id===sel), [msgsOrdini, allMsgs, sel]);

  // FIX MULTIORDINE: una card per ogni wa_msg (non raggruppa per tel).
  // Il backend crea wa_msgs separati con forceNew=true per i tester whitelist,
  // ogni ordine deve essere visibile indipendentemente nella lista.
  const msgsFiltrati = useMemo(() => {
    const nuovi      = msgsOrdini.filter(m => m.stato==="NUEVO"||!m.stato||m.stato==="IN_TRATTAMENTO")
      .sort((a,b) => Number(b.ts||0) - Number(a.ts||0));
    const inCocina   = msgsOrdini.filter(m => m.stato==="COCINA")
      .sort((a,b) => Number(b.ts||0) - Number(a.ts||0));
    const consegnati = msgsOrdini.filter(m => m.stato==="RETIRADO"||m.stato==="COMPLETATO")
      .sort((a,b) => Number(b.ts||0) - Number(a.ts||0));
    return [...nuovi, ...inCocina, ...consegnati];
  }, [msgsOrdini]);

  const handleSel    = useCallback(id => setSel(id), []);
  const handleBack   = useCallback(() => setSel(null), []);

  // Conta messaggi non letti (uno per ogni wa_msg, non per cliente)
  const nOrdenesPend = useMemo(() => {
    return msgsOrdini.filter(m=>!m.leido&&(m.stato==="NUEVO"||!m.stato)).length;
  }, [msgsOrdini]);
  const nPreguntasPend = msgsPreguntas.filter(m=>!m.leido).length;

  // Sub-tab bar
  const SubTabBar = () => (
    <div style={{
      display:"flex", gap:0,
      background:C.carbone2,
      borderBottom:`1px solid ${C.fumo}`,
      flexShrink:0
    }}>
      {[
        {id:"ordenes",  label:"Pedidos",  badge:nOrdenesPend,  color:C.wa},
        {id:"preguntas",label:"Preguntas",badge:nPreguntasPend,color:C.viola},
      ].map(t=>{
        const isOn = subTab === t.id;
        return (
          <button key={t.id} onClick={()=>{ setSubTab(t.id); setSel(null); }} style={{
            flex:1,
            background:"transparent",
            border:"none",
            borderBottom:`2.5px solid ${isOn ? t.color : "transparent"}`,
            color: isOn ? t.color : C.grigio,
            fontWeight: isOn ? 800 : 500,
            fontSize:13, padding:"10px 4px",
            display:"flex",alignItems:"center",justifyContent:"center",gap:6,
            transition:"all .15s",cursor:"pointer"
          }}>
            <span>{t.id==="ordenes"?"💬":"💭"}</span>
            <span>{t.label}</span>
            {t.badge>0 && <Badge n={t.badge} c={t.color}/>}
          </button>
        );
      })}
    </div>
  );

  const isPreguntas = subTab === "preguntas";

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <SubTabBar/>

      {/* TabPreguntas — sempre montato, solo visibilità CSS cambia: la state sopravvive al cambio tab */}
      <div style={{flex:isPreguntas?1:0, overflow:"hidden", display:isPreguntas?"flex":"none", flexDirection:"column"}}>
        <TabPreguntas
          msgs={msgsPreguntas}
          allMsgs={allMsgs}
          ordenes={ordenes}
          onCreaOrdine={onCreaOrdenFromChat}
          onElimina={onElimina}
          onRispondi={onRispondi}
          onAddicion={onAddicion}
          onConfirmaDaConfermare={onConfirmaDaConfermare}
          onNuevoPedido={onNuevoPedido}
          onMoveToNuevo={onMoveToNuevo}
        />
      </div>

      {/* Ordenes — mostrato solo quando subTab === "ordenes" */}
      {!isPreguntas && !isTablet && sel && selMsg && (
        <WADettaglio msg={selMsg} onConfirm={onConfirm} onManual={onManual}
          onBack={handleBack} onElimina={onElimina} onRispondi={onRispondi}
          allMsgs={allMsgs} onAgregar={onAddicion} ordenes={ordenes} onUpdateIaItems={onUpdateIaItems} onMoveToPreguntas={onMoveToPreguntas}/>
      )}
      {!isPreguntas && !isTablet && !(sel && selMsg) && (
        <WaLista msgs={msgsOrdini} msgsFiltrati={msgsFiltrati}
          sel={sel} setSel={handleSel} isTablet={false} msgsPreguntas={msgsPreguntas}/>
      )}
      {!isPreguntas && isTablet && (
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          <WaLista msgs={msgsOrdini} msgsFiltrati={msgsFiltrati}
            sel={sel} setSel={handleSel} isTablet={true} msgsPreguntas={msgsPreguntas}/>
          {selMsg
            ? <div style={{flex:1,overflow:"hidden"}}>
                <WADettaglio msg={selMsg} onConfirm={onConfirm} onManual={onManual}
                  onElimina={onElimina} onRispondi={onRispondi}
                  allMsgs={allMsgs} onAgregar={onAddicion} ordenes={ordenes} onUpdateIaItems={onUpdateIaItems} onMoveToPreguntas={onMoveToPreguntas}/>
              </div>
            : <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <div style={{color:"#2A2A2A",fontSize:14}}>Selecciona un mensaje →</div>
              </div>
          }
        </div>
      )}
    </div>
  );
};

// ─── TAB MANUAL ───────────────────────────────────────
// ─── CARD ORDINE (shared per Tel e Banco) ─────────────────────

export default TabWA;

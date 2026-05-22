import { useState } from 'react';
import { C } from '../../constants';
import { isCompletedState, orderStateRank } from '../../core/orders';
import OrdenCard from './OrdenCard';

const sortOrdenes = (list) => list.sort((a,b) => {
  const ra = orderStateRank(a.estado);
  const rb = orderStateRank(b.estado);
  if (ra !== rb) return ra - rb;
  return Number(b.ts||0) - Number(a.ts||0);
});

const TabBanco = ({ordenes, onModifica, onElimina, onConfirm, onForzarEntrega, vipIds, loadingIds = new Set()}) => {
  const [showDone, setShowDone] = useState(false);

  const all     = ordenes.filter(o=>o.canal==="BANCO");
  const activos = sortOrdenes(all.filter(o=>!isCompletedState(o.estado)));
  const done    = sortOrdenes(all.filter(o=>isCompletedState(o.estado)));

  const cardProps = (o) => ({
    o, onModifica, accentColor:C.avana,
    onElimina, onConfirm, onForzarEntrega, vipIds, loadingIds
  });

  if (all.length === 0) return (
    <div style={{background:"rgba(255,255,255,0.04)",borderRadius:14,
      border:"1px solid rgba(255,255,255,0.08)",
      padding:"50px 0",textAlign:"center",color:C.grigio,fontSize:14}}>
      Sin pedidos en la barra
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>

      {/* Attivi */}
      {activos.length === 0
        ? <div style={{background:"rgba(255,255,255,0.03)",borderRadius:12,
            border:"1px solid rgba(255,255,255,0.06)",
            padding:"24px 0",textAlign:"center",color:"rgba(255,255,255,0.2)",fontSize:13}}>
            ✅ Sin pedidos activos
          </div>
        : activos.map(o=><OrdenCard key={o.id} {...cardProps(o)}/>)
      }

      {/* Consegnati — collassabili */}
      {done.length > 0 && (
        <div style={{marginTop:6}}>
          <button onClick={()=>setShowDone(v=>!v)} style={{
            width:"100%", background:"rgba(255,255,255,0.03)",
            border:"1px solid rgba(255,255,255,0.07)",
            borderRadius:10, padding:"10px 16px",
            display:"flex", alignItems:"center", justifyContent:"space-between",
            color:"rgba(255,255,255,0.3)", fontSize:12, fontWeight:700,
            letterSpacing:1, textTransform:"uppercase", cursor:"pointer"
          }}>
            <span>✅ Entregados · {done.length}</span>
            <span style={{fontSize:16}}>{showDone ? "▲" : "▼"}</span>
          </button>
          {showDone && (
            <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:8}}>
              {done.map(o=><OrdenCard key={o.id} {...cardProps(o)}/>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TabBanco;

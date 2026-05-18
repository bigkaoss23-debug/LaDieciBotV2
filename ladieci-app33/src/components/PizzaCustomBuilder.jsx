import { useState } from 'react';
import { C, INGREDIENTI, GRUPPI_ING, PIZZA_BASE } from '../constants';

const PizzaCustomBuilder = ({setItems}) => {
  const [gruppo, setGruppo] = useState("Verduras y hierbas");
  const [ingSelezionati, setIngSelezionati] = useState([]);

  const toggleIng = (ing) => {
    setIngSelezionati(prev => {
      const giaPresente = prev.find(i => i.id === ing.id);
      return giaPresente ? prev.filter(i => i.id !== ing.id) : [...prev, ing];
    });
  };

  const extras = ingSelezionati.filter(i => i.tipo !== "base");
  const prezzoExtra = extras.reduce((s, i) => s + i.prezzo, 0);
  const prezzoTot = Math.round((PIZZA_BASE.p + prezzoExtra) * 100) / 100;
  const descr = extras.length > 0
    ? `Base Pelusa + ${extras.map(i => i.n).join(", ")}`
    : "Base Pelusa (Tomate + Fior di latte)";

  const handleAggiungi = () => {
    if (extras.length === 0) return;
    const newItem = {
      id: "custom_" + Date.now(),
      n: "Pizza a tu gusto",
      sub: descr,
      e: "⭐",
      p: prezzoTot,
      q: 1,
      cat: "Pizzas",
      _ingredienti: ingSelezionati,
      ing: descr
    };
    setItems(prev => [...prev, newItem]);
    setIngSelezionati([]);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:0}}>
      {/* Header info */}
      <div style={{
        background:`linear-gradient(135deg,rgba(196,168,122,0.15),rgba(160,130,80,0.1))`,
        border:`1px solid rgba(196,168,122,0.3)`,
        borderRadius:12,padding:"10px 14px",marginBottom:12,
        display:"flex",alignItems:"center",justifyContent:"space-between"
      }}>
        <div>
          <div style={{color:C.avana,fontWeight:800,fontSize:14}}>⭐ Pizza a tu gusto</div>
          <div style={{color:C.grigio,fontSize:11,marginTop:2}}>
            Base: Tomate San Marzano + Fior di latte — {PIZZA_BASE.p.toFixed(2)}€
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{color:C.verde,fontWeight:900,fontSize:18,fontFamily:"'DM Mono',monospace"}}>
            {prezzoTot.toFixed(2)}€
          </div>
          {extras.length > 0 && (
            <div style={{color:C.grigio,fontSize:10}}>
              +{prezzoExtra.toFixed(2)}€ extras
            </div>
          )}
        </div>
      </div>

      {/* Ingredienti selezionati preview + bottone Añadir */}
      {extras.length > 0 && (
        <div style={{
          background:C.carbone2,borderRadius:10,padding:"8px 12px",
          marginBottom:10
        }}>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
            {extras.map(ing => (
              <span key={ing.id} onClick={() => toggleIng(ing)} style={{
                background:ing.tipo==="premium"?"rgba(196,168,122,0.25)":"rgba(232,52,28,0.2)",
                border:`1px solid ${ing.tipo==="premium"?"rgba(196,168,122,0.5)":"rgba(232,52,28,0.4)"}`,
                color:ing.tipo==="premium"?C.avana:C.rosso,
                borderRadius:20,padding:"3px 10px",fontSize:12,fontWeight:600,cursor:"pointer"
              }}>
                {ing.e} {ing.n} ×
              </span>
            ))}
          </div>
          <button onClick={handleAggiungi} style={{
            width:"100%",
            background:`linear-gradient(135deg,#C4A87A,#A0854A)`,
            border:"none",color:"#fff",borderRadius:10,
            padding:"11px 0",fontWeight:900,fontSize:15,
            letterSpacing:.3,cursor:"pointer",
            boxShadow:"0 4px 14px rgba(196,168,122,0.35)",
            fontFamily:"'Satoshi',-apple-system,sans-serif"
          }}>
            ⭐ Añadir esta pizza al pedido · {prezzoTot.toFixed(2)}€
          </button>
        </div>
      )}

      {/* Filtro gruppo */}
      <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:10,paddingBottom:2}}>
        {GRUPPI_ING.map(g => (
          <button key={g} onClick={() => setGruppo(g)} style={{
            background:gruppo===g?"rgba(196,168,122,0.25)":"transparent",
            border:`1px solid ${gruppo===g?"rgba(196,168,122,0.5)":C.fumo}`,
            color:gruppo===g?C.avana:C.grigio,
            borderRadius:20,padding:"5px 12px",fontSize:11,fontWeight:600,
            whiteSpace:"nowrap",flexShrink:0,cursor:"pointer"
          }}>{g}</button>
        ))}
      </div>

      {/* Grid ingredienti */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:7}}>
        {INGREDIENTI.filter(i => i.gruppo === gruppo).map(ing => {
          const sel = ingSelezionati.find(i => i.id === ing.id);
          const isBase = ing.tipo === "base";
          const isPremium = ing.tipo === "premium";
          return (
            <button key={ing.id} onClick={() => !isBase && toggleIng(ing)} style={{
              background: sel
                ? isPremium ? "rgba(196,168,122,0.25)" : C.rosso+"33"
                : C.carbone2,
              border:`2px solid ${sel
                ? isPremium ? C.avana : C.rosso
                : isBase ? "rgba(255,255,255,0.05)" : C.fumo}`,
              borderRadius:12,padding:"10px 8px",
              display:"flex",flexDirection:"column",alignItems:"center",gap:4,
              cursor:isBase?"default":"pointer",
              opacity:isBase?0.5:1,
              position:"relative",
              boxShadow:sel?`0 3px 12px ${isPremium?C.avana:C.rosso}33`:"none"
            }}>
              <span style={{fontSize:22}}>{ing.e}</span>
              <span style={{color:C.bianco,fontSize:11,fontWeight:600,
                textAlign:"center",lineHeight:1.2}}>{ing.n}</span>
              <span style={{
                color: isBase?"#444":isPremium?C.avana:C.rosso,
                fontSize:11,fontWeight:700
              }}>
                {isBase?"incluido":`+${ing.prezzo.toFixed(2)}€`}
              </span>
              {sel && !isBase && (
                <span style={{
                  position:"absolute",top:-6,right:-6,
                  background:isPremium?C.avana:C.rosso,
                  color:"#fff",borderRadius:"50%",
                  width:16,height:16,fontSize:9,fontWeight:900,
                  display:"flex",alignItems:"center",justifyContent:"center"
                }}>✓</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PizzaCustomBuilder;

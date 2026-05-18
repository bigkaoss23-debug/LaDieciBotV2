import { C } from '../../constants';

const IaPill = ({conf}) => {
    if (!conf || conf === 0) return null;
    const color  = conf>=70 ? C.verde  : conf>=35 ? C.orange : C.rosso;
    const bg     = conf>=70 ? "rgba(34,197,94,0.14)"  : conf>=35 ? "rgba(249,115,22,0.14)"  : "rgba(232,52,28,0.14)";
    const border = conf>=70 ? "rgba(34,197,94,0.38)"  : conf>=35 ? "rgba(249,115,22,0.38)"  : "rgba(232,52,28,0.38)";
    return (
      <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0,
        background:bg,border:`1px solid ${border}`,borderRadius:20,padding:"3px 8px"}}>
        <div style={{width:26,height:3,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}>
          <div style={{width:`${conf}%`,height:"100%",background:`linear-gradient(90deg,${color}66,${color})`,borderRadius:2}}/>
        </div>
        <span style={{color,fontSize:10,fontWeight:800}}>{conf}%</span>
      </div>
    );
  };

export default IaPill;

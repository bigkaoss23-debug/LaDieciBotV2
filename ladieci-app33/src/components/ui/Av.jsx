import { C } from '../../constants';

const Av = ({name,size=38}) => (
  <div style={{width:size,height:size,borderRadius:"50%",flexShrink:0,
    background:`linear-gradient(135deg,${C.rosso},${C.rossoV})`,
    display:"flex",alignItems:"center",justifyContent:"center",
    color:"#fff",fontWeight:700,fontSize:size*.34,border:`2px solid ${C.fumo}`}}>
    {name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
  </div>
);

export default Av;

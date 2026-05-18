import { C } from '../../constants';

const Badge = ({n,c=C.rosso}) => n>0 ? (
  <span style={{background:c,color:"#fff",borderRadius:20,fontSize:10,fontWeight:700,
    padding:"1px 6px",minWidth:18,textAlign:"center",animation:"pop .2s ease",
    display:"inline-flex",alignItems:"center",justifyContent:"center",
    boxShadow:`0 1px 6px ${c}66`}}>{n}</span>
) : null;

export default Badge;

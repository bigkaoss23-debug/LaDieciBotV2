
const Chip = ({label,color,sm}) => (
  <span style={{background:color+"1A",color,border:`1px solid ${color}30`,
    borderRadius:20,padding:sm?"2px 8px":"3px 11px",
    fontSize:sm?10:12,fontWeight:600,whiteSpace:"nowrap"}}>{label}</span>
);

export default Chip;

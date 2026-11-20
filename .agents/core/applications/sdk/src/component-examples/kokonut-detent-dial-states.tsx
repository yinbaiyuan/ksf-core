import {Dial} from '@ksf/sdk/dial';
export default function Example(){return <div style={{display:'flex',gap:24,flexWrap:'wrap',alignItems:'start'}}><Dial label="小数档位" min={0} max={2} step={.1} defaultValue={.7} unit="x"/><Dial label="锁定" value={1} min={0} max={2} unit="x" disabled/></div>;}

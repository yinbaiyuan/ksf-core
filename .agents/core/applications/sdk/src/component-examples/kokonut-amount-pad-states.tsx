import {AmountPad} from '@ksf/sdk/amount-pad';
export default function Example(){return <div style={{display:'flex',gap:24,flexWrap:'wrap',alignItems:'start',width:'100%',minWidth:0}}><AmountPad label="锁定金额" value="120.50" disabled/><AmountPad label="99.99上限" max={99.99} presets={[10,20,50]} defaultValue="12" balance={100}/></div>;}

import {useState} from 'react';
import {AmountPad} from '@ksf/sdk/amount-pad';
export default function Example(){const [value,setValue]=useState(''),[confirmed,setConfirmed]=useState<number>();return <div style={{display:'grid',gap:12,justifyItems:'center',width:'100%',minWidth:0}}><AmountPad label="Amount" value={value} onValueChange={setValue} onConfirm={setConfirmed} confirmLabel="Confirm"/><output aria-live="polite">{confirmed===undefined?'输入金额，选择预设或按键盘数字。':`已记录本地确认意图 $${confirmed.toFixed(2)}`} 不发起转账。</output></div>;}

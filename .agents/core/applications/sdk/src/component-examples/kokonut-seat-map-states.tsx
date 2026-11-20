import {useState} from 'react';

import {SeatMap} from '@ksf/sdk/seat-map';
export default function Example(){const [open,setOpen]=useState(false);return <div style={{display:'flex',gap:24,flexWrap:'wrap',alignItems:'start'}}><SeatMap label="只读座位" disabled value={['a1']} seats={[{id:'a1',row:'A',column:1,label:'A排1座'},{id:'a2',row:'A',column:2,label:'A排2座',unavailable:true},{id:'a3',row:'A',column:3,label:'A排3座'}]}/></div>;}

import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {AvatarGroup} from '@ksf/sdk/avatar-group';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function AvatarGroupDynamicExample(){const [max,setMax]=useState(3);return <div className='ksf-demo-stack'><AvatarGroup label='参与成员' max={max} items={['小林','小王','小李','小陈','小周'].map(name=>({name}))}/><Button onClick={()=>setMax(max===3?5:3)}>展开／折叠成员</Button></div>;}

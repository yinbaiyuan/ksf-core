import {useState} from 'react';
import {CardStack} from '@ksf/sdk/card-stack';
export default function Example(){const [active,setActive]=useState<string>(),[action,setAction]=useState('');return <div style={{width:'100%'}}><CardStack label="限量版画收藏" activeId={active} onActiveChange={setActive} actionLabel="加入本地清单" onAction={setAction}/><output aria-live="polite">{action?'已选择 '+action:active?'当前 '+active:'轻甩或用方向键换卡；点击卡片展开详情。'}</output></div>;}

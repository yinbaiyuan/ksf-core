import {BentoGrid} from '@ksf/sdk/bento-grid';

export default function Example(){return <div style={{display:'grid',gap:16,width:'100%'}}><BentoGrid label="只读看板" widgets={[{id:'one',title:'只读部件',columns:6,content:'缺少变更回调时不可拖动或调整。'}]}/><BentoGrid label="空看板" widgets={[]}/></div>;}

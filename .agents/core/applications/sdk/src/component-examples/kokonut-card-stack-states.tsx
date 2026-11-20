import {CardStack} from '@ksf/sdk/card-stack';

export default function Example(){return <div style={{display:"grid",gap:20,width:"100%"}}><CardStack label="暂无卡片" cards={[]}/><CardStack label="锁定卡片" cards={[{id:'research',title:'资料整理',description:'拖动卡片，或使用下方按钮。',content:<span style={{fontSize:48}}>◈</span>},{id:'design',title:'界面设计',description:'主题沿KSF浅深设置。',content:<span style={{fontSize:48}}>✦</span>},{id:'review',title:'效果核对',description:'本地示例，独立窗口状态。',content:<span style={{fontSize:48}}>◇</span>}]} disabled/></div>;}

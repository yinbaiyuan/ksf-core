import {GridLayout} from 'react-grid-layout';
import {mountProbe,useProbe,Overlay} from './common';
import type {ApplicationSDK} from '@ksf/sdk';
import 'react-grid-layout/css/styles.css';
function App(){const p=useProbe();return <main className="probe" data-library="React Grid Layout"><h1>React Grid Layout 独立应用</h1><p>应用自行打包网格组件与 React。</p><input aria-label="Grid 草稿" value={p.draft} onChange={e=>p.setDraft(e.target.value)}/><GridLayout width={400} layout={[{i:'one',x:0,y:0,w:6,h:1},{i:'two',x:6,y:0,w:6,h:1}]} gridConfig={{cols:12,rowHeight:50}} dragConfig={{enabled:false}} resizeConfig={{enabled:false}}><div key="one">网格 A</div><div key="two">网格 B</div></GridLayout><button ref={p.trigger} className="probe-button" onClick={()=>p.setOpen(true)}>打开 Grid 弹层</button>{p.open&&<Overlay appId={p.sdk.appId}><div ref={p.panel} className="probe-panel" role="dialog" aria-label="Grid 应用内弹层" tabIndex={-1}><p>弹层放在 SDK overlayHost 中。</p><input aria-label="Grid 弹层输入"/><button onClick={()=>p.setOpen(false)}>关闭 Grid 弹层</button></div></Overlay>}</main>}
export function mount(container:HTMLElement,sdk:ApplicationSDK){return mountProbe(App,container,sdk)}

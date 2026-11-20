import React,{useRef} from 'react';
import {createRoot} from 'react-dom/client';
import MagicBento from './upstream/MagicBento';
import {DesktopCard} from '../../../src/desktop/desktop-card';
import {DesktopCardEffects} from '../../../src/desktop/card-effects';
import './comparison.css';
const dark=new URLSearchParams(location.search).get('theme')!=='light';
const reference=location.pathname.includes('reference');
function Content(){return <div className="widget-content"><table><thead><tr><th>周期</th>{['聊天','对话轮次','项目','知识','能力'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{['今日','本周'].map((x,i)=><tr key={x}><th>{x}</th>{[7,60,0,0,0].map((n,j)=><td key={j}><button aria-label={x+j}>{n*(i+1)}</button></td>)}</tr>)}</tbody></table><p>今日项目　暂无</p><p>今日知识　暂无</p><p>今日能力　暂无</p></div>}
function App(){const grid=useRef<HTMLDivElement>(null);return <main className={'os-desktop '+(dark?'host-theme-dark':'host-theme-light')}><p className="legend">{reference?'官方原版':'工作台接入'} · 固定验证数据</p>{reference?<div className="reference"><MagicBento items={[{id:'a',content:<Content/>},{id:'b',content:<Content/>}]} columns={2} rowHeight={200} gap={96} radius={6} theme={dark?'dark':'light'} enableTilt enableMagnetism intro={false} clickEffect={false} textAutoHide={false}/></div>:<><div className="desktop-grid-scroll"><div ref={grid} className="desktop-grid">{['a','b'].map((id,i)=><div key={id} className="desktop-tile" style={{left:40+i*568,top:40,width:536,height:264}}><DesktopCard name={id} editing={false} radius={6} onKeyDown={()=>{}}><Content/></DesktopCard></div>)}</div></div><DesktopCardEffects grid={grid} paused={false} motion layoutKey="fixture"/></>}</main>}
createRoot(document.getElementById('root')!).render(<App/>);

import {ScrollArea} from '@ksf/sdk/scroll-area';import '@ksf/sdk/component-examples/catalog-examples.css';
export function ScrollAreaBasicExample(){return <ScrollArea label="可滚动的资料列表" style={{height:220}} className="ksf-demo-frame"><div className="ksf-demo-article">{Array.from({length:18},(_,i)=><p key={i}>资料记录 {i+1} · 保留原生键盘与触控板行为。</p>)}</div></ScrollArea>;}

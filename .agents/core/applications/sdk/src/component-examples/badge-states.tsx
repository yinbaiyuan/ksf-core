import {Badge} from '@ksf/sdk/badge';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function BadgeStatesExample(){return <div className="ksf-demo-stack">{(['success','error','default','processing','warning'] as const).map(status=><Badge key={status} status={status} text={status}/>)}<div className="ksf-demo-row"><Badge count="新" tone="primary"/><Badge count={0} showZero/></div></div>;}

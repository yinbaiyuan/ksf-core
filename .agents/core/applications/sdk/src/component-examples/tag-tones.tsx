import {Tag} from '@ksf/sdk/tag';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TagTonesExample(){return <div className="ksf-demo-stack">{(['filled','outlined'] as const).map(appearance=><div key={appearance}><p className="ksf-demo-muted">{appearance}</p><div style={{display:'flex',flexWrap:'wrap',gap:'8px 0'}}>{(['neutral','primary','success','warning','danger','info'] as const).map(tone=><Tag key={tone} appearance={appearance} tone={tone}>{tone}</Tag>)}</div></div>)}</div>;}

import {Avatar} from '@ksf/sdk/avatar';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function AvatarSizesExample(){return <div className="ksf-demo-row">{(['small','medium','large',64] as const).map(size=><div key={size} style={{display:'grid',gap:8,justifyItems:'center'}}><Avatar name="小林" size={size}/><span className="ksf-demo-muted">{typeof size==='number'?`${size}px 自定义`:size}</span></div>)}</div>;}

import {InlineAlert} from '@ksf/sdk/inline-alert';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function InlineAlertTonesExample(){return <div className="ksf-demo-stack">{(['info','success','warning','error'] as const).map(tone=><div key={tone} className="ksf-demo-stack"><InlineAlert icon heading={tone+' outlined'} tone={tone}>当前状态的具体说明。</InlineAlert><InlineAlert icon variant="filled" heading={tone+' filled'} tone={tone}>填充背景，隐藏描边。</InlineAlert></div>)}</div>;}

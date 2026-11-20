import {View} from '@ksf/sdk/view';import '@ksf/sdk/component-examples/catalog-examples.css';
export function ViewFlexExample(){return <View direction="row" wrap gap={12} align="center" justify="space-between" style={{background:'transparent'}}>{['横向排列','统一间距','空间分配'].map(name=><div key={name} className="ksf-demo-box">{name}</div>)}</View>;}

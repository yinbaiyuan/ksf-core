import {TreeSelect} from '@ksf/sdk/tree-select';
import '@ksf/sdk/component-examples/catalog-examples.css';
const nodes=[{id:'root',label:'项目',children:[{id:'design',label:'设计',children:[{id:'ui',label:'界面设计'},{id:'motion',label:'动态交互'}]},{id:'research',label:'用户研究'},{id:'disabled',label:'暂不可用',disabled:true}]}];
export function TreeSelectTagsExample(){return <div className="ksf-demo-stack" style={{width:220,maxWidth:'100%'}}><TreeSelect clearable defaultExpandAll label="标签自动换行" nodes={nodes} multiple defaultValue={['ui','motion','research']}/><TreeSelect clearable defaultExpandAll label="限制显示数量" nodes={nodes} multiple maxVisibleTags={1} defaultValue={['ui','motion','research']}/></div>;}

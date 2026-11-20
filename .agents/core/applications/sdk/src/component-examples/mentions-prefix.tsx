import {Mentions} from '@ksf/sdk/mentions';
import '@ksf/sdk/component-examples/catalog-examples.css';
const options=[{value:'design',label:'设计',description:'界面与交互'},{value:'research',label:'研究',description:'需求与验证'},{value:'build',label:'开发'},{value:'blocked',label:'暂不可用',disabled:true}];
export function MentionsPrefixExample(){return <div className="ksf-demo-stack"><Mentions label="引用议题" prefix="#" options={options} placeholder="输入 # 选择议题"/><Mentions label="多个前缀" prefix={['@','#']} options={options} placeholder="输入 @ 或 #，首项可直接按 Enter"/></div>;}

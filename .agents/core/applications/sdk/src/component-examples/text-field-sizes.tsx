import {TextField} from '@ksf/sdk/text-field';import '@ksf/sdk/component-examples/catalog-examples.css';
export function TextFieldSizesExample(){return <div className="ksf-demo-stack"><TextField label="小尺寸" size="small" placeholder="紧凑内容区"/><TextField label="默认尺寸" placeholder="常规表单"/><TextField label="大尺寸" size="large" placeholder="突出输入"/></div>;}

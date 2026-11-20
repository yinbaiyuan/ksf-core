import {Divider} from '@ksf/sdk/divider';import '@ksf/sdk/component-examples/catalog-examples.css';
export function DividerBasicExample(){return <div className="ksf-demo-stack"><p>用分隔线组织相关内容。</p><Divider decorative={false}/><p>默认分隔使用公共轻边界。</p><Divider decorative={false} dashed>更多资料</Divider><p>标题分隔和虚线也使用相同语义色。</p></div>;}

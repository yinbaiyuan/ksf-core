import {AppLayout} from '@ksf/sdk/app-layout';import '@ksf/sdk/component-examples/catalog-examples.css';
export function AppLayoutSimpleExample(){return <AppLayout className="ksf-demo-frame" header={<strong>资料详情</strong>} footer="最近更新 · 本地示例"><h3>只保留需要的区域</h3><p>省略侧栏即可形成简单的纵向应用布局。</p></AppLayout>;}

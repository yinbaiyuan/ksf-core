import {Divider} from '@ksf/sdk/divider';import {Space} from '@ksf/sdk/space';import '@ksf/sdk/component-examples/catalog-examples.css';
export function DividerVerticalExample(){return <Space gap={12} wrap={false}><span>资料</span><Divider orientation="vertical"/><span>最近更新</span><Divider orientation="vertical"/><span>12 项</span></Space>;}

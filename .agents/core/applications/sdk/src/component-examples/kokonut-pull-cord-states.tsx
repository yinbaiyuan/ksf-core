import {PullSwitch} from '@ksf/sdk/pull-switch';
export default function Example(){return <div style={{display:'flex',gap:24,flexWrap:'wrap',alignItems:'start'}}><PullSwitch label="锁定开启" checked disabled/><PullSwitch label="锁定关闭" checked={false} disabled/></div>;}

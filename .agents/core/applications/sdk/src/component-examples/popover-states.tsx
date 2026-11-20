import {useState} from 'react';
import {Popover} from '@ksf/sdk/popover';
import {Button} from '@ksf/sdk/button';
import {TextField} from '@ksf/sdk/text-field';
import {Checkbox} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PopoverStatesExample(){const [placement,setPlacement]=useState<'top'|'bottom'|'left'|'right'>('right');return <div className='ksf-demo-stack'><label>方向 <select aria-label='气泡方向' value={placement} onChange={e=>setPlacement(e.target.value as typeof placement)}>{['top','bottom','left','right'].map(value=><option key={value}>{value}</option>)}</select></label><Popover trigger='hover' label='资料摘要' heading='悬停或聚焦查看' placement={placement} content={<p>内容可以交互，鼠标移入气泡后保留；窗口边缘自动翻转。</p>}><Button>查看摘要</Button></Popover><Popover label='禁用气泡' disabled content='不显示此内容'><Button>气泡已禁用</Button></Popover></div>;}

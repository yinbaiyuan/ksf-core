import {useState} from 'react';
import {Tooltip} from '@ksf/sdk/tooltip';
import {Button} from '@ksf/sdk/button';
import {TextField} from '@ksf/sdk/text-field';
import {Checkbox} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TooltipStatesExample(){return <div className='ksf-demo-row'>{(['top','bottom','left','right'] as const).map(placement=><Tooltip key={placement} placement={placement} content={`${placement}方向，边界不足时自动翻转`}><Button>{({top:'上方',bottom:'下方',left:'左侧',right:'右侧'})[placement]}</Button></Tooltip>)}</div>;}

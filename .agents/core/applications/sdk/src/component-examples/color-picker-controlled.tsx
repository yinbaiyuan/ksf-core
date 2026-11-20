import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ColorPicker} from '@ksf/sdk/color-picker';
import {Popover} from '@ksf/sdk/popover';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ColorPickerControlledExample(){const [value,setValue]=useState('#005fb8');return <div className='ksf-demo-stack'><ColorPicker label='受控颜色' value={value} onValueChange={setValue}/><div className='ksf-demo-row'><Button size='small' onClick={()=>setValue('#0f7b0f')}>切换成功色</Button><Button size='small' onClick={()=>setValue('#005fb8')}>恢复示例色</Button></div></div>;}

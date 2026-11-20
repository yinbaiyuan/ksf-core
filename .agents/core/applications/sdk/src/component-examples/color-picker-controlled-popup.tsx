import {Button} from '@ksf/sdk/button';
import {useState} from 'react';
import {ColorPicker} from '@ksf/sdk/color-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ColorPickerControlledPopupExample(){const [open,setOpen]=useState(false),[value,setValue]=useState('#005fb8');return <div className="ksf-demo-stack"><ColorPicker label="受控颜色面板" value={value} onValueChange={setValue} open={open} onOpenChange={setOpen} showValue panelFooter={<Button size="small" onClick={()=>setOpen(false)}>完成</Button>}/><Button onClick={()=>setOpen(true)}>打开受控面板</Button></div>;}

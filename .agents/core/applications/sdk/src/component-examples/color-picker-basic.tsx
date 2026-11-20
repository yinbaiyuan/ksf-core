import {useState,useRef} from 'react';
import {ColorPicker} from '@ksf/sdk/color-picker';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ColorPickerBasicExample(){const [value,setValue]=useState('#005fb8');return <div className='ksf-demo-stack'><ColorPicker label='画布颜色' value={value} onValueChange={setValue}/><div style={{height:64,borderRadius:6,background:value}} aria-label='所选颜色预览'/></div>;}

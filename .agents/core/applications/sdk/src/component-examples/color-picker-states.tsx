import {useState,useRef} from 'react';
import {ColorPicker} from '@ksf/sdk/color-picker';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ColorPickerStatesExample(){return <form className='ksf-demo-stack'><ColorPicker label='原生颜色面板' name='color' defaultValue='#b45309'/><ColorPicker label='禁用颜色' disabled defaultValue='#737373'/><Button type='reset'>还原颜色</Button></form>;}

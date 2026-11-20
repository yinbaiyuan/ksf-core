import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ColorPicker} from '@ksf/sdk/color-picker';
import {Popover} from '@ksf/sdk/popover';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ColorPickerInlineExample(){const [value,setValue]=useState('#005fb8');return <div className='ksf-demo-stack'><ColorPicker label='内嵌颜色选择' presentation='inline' alpha presets={['#005fb8','#60cdff','#0f7b0f','#9d5d00','#c42b1c','#282828']} value={value} onValueChange={setValue}/><output>{value}</output></div>;}

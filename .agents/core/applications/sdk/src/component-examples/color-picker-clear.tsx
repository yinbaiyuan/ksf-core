import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ColorPicker} from '@ksf/sdk/color-picker';
import {Popover} from '@ksf/sdk/popover';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ColorPickerClearExample(){const [value,setValue]=useState('#005fb8');return <div className='ksf-demo-stack'><ColorPicker label='可清空颜色' clearable value={value} onValueChange={setValue}/><output>{value||'未设置颜色'}</output></div>;}

import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ColorPicker} from '@ksf/sdk/color-picker';
import {Popover} from '@ksf/sdk/popover';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ColorPickerNativeExample(){const [value,setValue]=useState('#005fb8');return <div className='ksf-demo-stack'><ColorPicker label='浏览器原生拾色器' presentation='native' value={value} onValueChange={setValue}/><output>{value}</output></div>;}

import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ColorPicker} from '@ksf/sdk/color-picker';
import {Popover} from '@ksf/sdk/popover';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ColorPickerReadOnlyExample(){return <div className='ksf-demo-row'><ColorPicker label='禁用颜色' disabled/><ColorPicker label='只读颜色' readOnly defaultValue='#0f7b0f'/></div>;}

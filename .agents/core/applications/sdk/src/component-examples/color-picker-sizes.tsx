import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ColorPicker} from '@ksf/sdk/color-picker';
import {Popover} from '@ksf/sdk/popover';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ColorPickerSizesExample(){return <div className='ksf-demo-row'>{(['small','medium','large'] as const).map(size=><ColorPicker key={size} label={size+'尺寸'} size={size} defaultValue='#005fb8'/>)}</div>;}

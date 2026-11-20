import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ColorPicker} from '@ksf/sdk/color-picker';
import {Popover} from '@ksf/sdk/popover';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ColorPickerGradientExample(){const [value,setValue]=useState('linear-gradient(90deg, #005fb8 0%, #60cdff 100%)');return <div className='ksf-demo-stack'><ColorPicker label='背景渐变' gradient alpha value={value} onValueChange={setValue}/><div style={{height:90,borderRadius:8,background:value}}/><output style={{overflowWrap:'anywhere'}}>{value}</output></div>;}

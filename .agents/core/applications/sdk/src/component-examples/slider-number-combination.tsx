import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Slider,RangeSlider} from '@ksf/sdk/slider';
import {NumberField} from '@ksf/sdk/number-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SliderNumberCombinationExample(){const [value,setValue]=useState(50);return <div className='ksf-demo-stack'><Slider label='数量' value={value} onValueChange={setValue}/><NumberField label='直接编辑数量' min={0} max={100} value={value} onValueChange={v=>setValue(Math.max(0,Math.min(100,v??0)))}/></div>;}

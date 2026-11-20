import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Slider,RangeSlider} from '@ksf/sdk/slider';
import {NumberField} from '@ksf/sdk/number-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SliderDisabledExample(){return <div className='ksf-demo-stack'><Slider label='禁用滑块' disabled defaultValue={35}/><RangeSlider label='禁用范围' disabled defaultValue={[20,60]}/><Slider label='只读滑块' readOnly defaultValue={65}/></div>;}

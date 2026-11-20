import {useState,useRef} from 'react';
import {Slider,RangeSlider} from '@ksf/sdk/slider';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SliderBasicExample(){const [value,setValue]=useState(35);return <div className='ksf-demo-stack'><Slider label='预览比例' min={0} max={100} step={5} value={value} onValueChange={setValue}/><RangeSlider label='显示区间' defaultValue={[20,80]} min={0} max={100}/></div>;}

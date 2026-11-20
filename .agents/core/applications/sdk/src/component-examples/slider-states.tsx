import {useState,useRef} from 'react';
import {Slider,RangeSlider} from '@ksf/sdk/slider';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SliderStatesExample(){return <div className='ksf-demo-stack'><Slider label='竖向' vertical defaultValue={40} min={0} max={100}/><Slider label='禁用' disabled defaultValue={60}/><RangeSlider label='固定区间' disabled defaultValue={[30,70]}/></div>;}

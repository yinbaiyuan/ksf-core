import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Slider,RangeSlider} from '@ksf/sdk/slider';
import {NumberField} from '@ksf/sdk/number-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SliderStepsExample(){return <div className='ksf-demo-stack'><Slider label='每10一个刻度' min={0} max={100} step={10} defaultValue={30}/><Slider label='小数步长' min={0} max={1} step={0.1} defaultValue={0.4}/></div>;}

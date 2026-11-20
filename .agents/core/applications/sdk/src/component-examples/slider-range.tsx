import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Slider,RangeSlider} from '@ksf/sdk/slider';
import {NumberField} from '@ksf/sdk/number-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SliderRangeExample(){const [value,setValue]=useState<readonly [number,number]>([25,75]);return <div className='ksf-demo-stack'><RangeSlider label='目标范围' value={value} onValueChange={setValue}/><output>{value[0]}—{value[1]}</output></div>;}

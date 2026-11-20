import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Slider,RangeSlider} from '@ksf/sdk/slider';
import {NumberField} from '@ksf/sdk/number-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SliderRangeMarksExample(){return <RangeSlider label='可接受区间' min={0} max={100} step={5} defaultValue={[30,70]} marks={[{value:0},{value:25},{value:50},{value:75},{value:100}]} formatValue={value=>value+'%'}/>;}

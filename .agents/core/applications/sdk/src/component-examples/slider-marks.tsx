import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Slider,RangeSlider} from '@ksf/sdk/slider';
import {NumberField} from '@ksf/sdk/number-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SliderMarksExample(){return <Slider label='舒适温度' min={16} max={32} defaultValue={24} marks={[{value:16,label:'16°C'},{value:20,label:'20°C'},{value:24,label:'24°C'},{value:28,label:'28°C'},{value:32,label:'32°C'}]}/>;}

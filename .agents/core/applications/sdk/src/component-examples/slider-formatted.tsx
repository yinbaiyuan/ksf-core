import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Slider,RangeSlider} from '@ksf/sdk/slider';
import {NumberField} from '@ksf/sdk/number-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SliderFormattedExample(){return <Slider label='完成比例' defaultValue={35} formatValue={value=>value+'%'} title='当前比例'/>;}

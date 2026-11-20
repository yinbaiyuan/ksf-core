import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Slider,RangeSlider} from '@ksf/sdk/slider';
import {NumberField} from '@ksf/sdk/number-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SliderVerticalExample(){return <div className='ksf-demo-row' style={{alignItems:'start'}}><Slider label='高度' vertical min={0} max={100} defaultValue={40} marks={[{value:0,label:'低'},{value:50,label:'中'},{value:100,label:'高'}]}/><RangeSlider label='高度范围' vertical defaultValue={[20,70]} marks={[{value:0,label:'0'},{value:50,label:'50'},{value:100,label:'100'}]}/></div>;}

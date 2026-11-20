import {useState} from 'react';
import {LiquidSlider} from '@ksf/sdk/liquid-slider';
export default function Example(){const [value,setValue]=useState(1250);return <LiquidSlider label="今日饮水" value={value} onValueChange={setValue} min={0} max={2000} step={50} unit="ml"/>;}

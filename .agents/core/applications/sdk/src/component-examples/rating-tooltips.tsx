import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Rating} from '@ksf/sdk/rating';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function RatingTooltipsExample(){const [value,setValue]=useState(3);return <div className='ksf-demo-stack'><Rating label='满意程度' value={value} onValueChange={setValue} tooltips={['很不满意','不满意','一般','满意','很满意']}/><output>{['未评分','很不满意','不满意','一般','满意','很满意'][value]}</output></div>;}

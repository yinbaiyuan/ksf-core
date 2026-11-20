import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Rating} from '@ksf/sdk/rating';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function RatingHalfExample(){const [value,setValue]=useState(2.5);return <div className='ksf-demo-stack'><Rating label='半星评分' allowHalf value={value} onValueChange={setValue}/><output>{value} / 5</output><span>点击星形左右半边；方向键每次调整0.5。</span></div>;}

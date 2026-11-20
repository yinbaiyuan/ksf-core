import {useState,useRef} from 'react';
import {Rating} from '@ksf/sdk/rating';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function RatingBasicExample(){const [value,setValue]=useState(3);return <div className='ksf-demo-stack'><Rating label='体验评分' value={value} onValueChange={setValue}/><output>{value?`${value} 星`:'再次点击可清空'}</output></div>;}

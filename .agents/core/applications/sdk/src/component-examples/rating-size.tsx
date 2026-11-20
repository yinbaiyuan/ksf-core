import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Rating} from '@ksf/sdk/rating';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function RatingSizeExample(){return <div className='ksf-demo-stack'><Rating label='小评分' defaultValue={3} style={{fontSize:18}}/><Rating label='大评分' defaultValue={4} style={{fontSize:36}}/></div>;}

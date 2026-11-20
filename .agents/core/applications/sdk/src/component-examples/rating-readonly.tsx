import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Rating} from '@ksf/sdk/rating';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function RatingReadonlyExample(){return <div className='ksf-demo-stack'><Rating label='只读评分' value={3.5} allowHalf readOnly/><Rating label='不可用评分' defaultValue={4} disabled/></div>;}

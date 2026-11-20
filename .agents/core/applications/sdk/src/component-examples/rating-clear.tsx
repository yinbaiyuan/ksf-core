import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Rating} from '@ksf/sdk/rating';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function RatingClearExample(){return <div className='ksf-demo-stack'><Rating label='允许清除' defaultValue={3} clearable/><Rating label='不可清除' defaultValue={3} clearable={false}/></div>;}

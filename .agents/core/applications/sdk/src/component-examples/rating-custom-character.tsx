import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Rating} from '@ksf/sdk/rating';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function RatingCustomCharacterExample(){return <div className='ksf-demo-stack'><Rating label='喜爱程度' character='♥' defaultValue={3}/><Rating label='字母等级' character={number=><span>{String.fromCharCode(64+number)}</span>} defaultValue={2}/><Rating label='十分制' count={10} defaultValue={6}/></div>;}

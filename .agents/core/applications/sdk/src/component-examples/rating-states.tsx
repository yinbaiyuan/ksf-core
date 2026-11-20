import {useState,useRef} from 'react';
import {Rating} from '@ksf/sdk/rating';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function RatingStatesExample(){return <div className='ksf-demo-stack'><Rating label='不可清空' defaultValue={4} clearable={false}/><Rating label='十分制' count={10} defaultValue={7}/><Rating label='禁用' disabled defaultValue={3}/></div>;}

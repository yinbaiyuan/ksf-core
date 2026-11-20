import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Field} from '@ksf/sdk/field';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FieldCompositionExample(){return <div className='ksf-demo-row'><Field label='姓氏'>{control=><TextField {...control} placeholder='尹'/>}</Field><Field label='名字'>{control=><TextField {...control} placeholder='超'/>}</Field></div>;}

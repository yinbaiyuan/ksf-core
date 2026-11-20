import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Checkbox,CheckboxGroup} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CheckboxControlledExample(){const [checked,setChecked]=useState(false);return <div className='ksf-demo-stack'><Checkbox label='允许继续' checked={checked} onCheckedChange={setChecked}/><Button size='small' onClick={()=>setChecked(v=>!v)}>外部切换</Button><output>{checked?'已勾选':'未勾选'}</output></div>;}

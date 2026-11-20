import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Checkbox,CheckboxGroup} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CheckboxSelectAllExample(){const all=['notes','plan','files'],[value,setValue]=useState<readonly string[]>(['notes']);return <div className='ksf-demo-stack'><Checkbox label='全选资料' checked={value.length===all.length} indeterminate={value.length>0&&value.length<all.length} onCheckedChange={checked=>setValue(checked?all:[])}/><CheckboxGroup label='资料清单' value={value} onValueChange={setValue} options={all.map((value,i)=>({value,label:['纪要','规划','附件'][i]}))}/><output>已选{value.length}项</output></div>;}

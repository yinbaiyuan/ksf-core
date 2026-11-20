import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Select} from '@ksf/sdk/select';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SelectClearExample(){const [value,setValue]=useState('a');return <div className='ksf-demo-stack'><Select label='可清空选择' clearable value={value} onValueChange={setValue} options={[{value:'a',label:'研究资料'},{value:'b',label:'项目清单'}]}/><output>值：{value||'空'}</output></div>;}

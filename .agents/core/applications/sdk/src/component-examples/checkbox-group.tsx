import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Checkbox,CheckboxGroup} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CheckboxGroupExample(){const [value,setValue]=useState<readonly string[]>(['notes']);return <div className='ksf-demo-stack'><CheckboxGroup label='选择资料' value={value} onValueChange={setValue} options={[{value:'notes',label:'讨论纪要'},{value:'plan',label:'规划说明'},{value:'locked',label:'暂不可用',disabled:true}]}/><output>{value.join('、')||'未选择'}</output></div>;}

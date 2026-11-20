import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Cascader} from '@ksf/sdk/cascader';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CascaderControlledExample(){const [value,setValue]=useState<string[]>([]);return <div className='ksf-demo-stack'><Cascader label='受控值' options={[{value:'east',label:'华东',children:[{value:'hangzhou',label:'杭州',children:[{value:'xihu',label:'西湖区'},{value:'yuhang',label:'余杭区'}]},{value:'shanghai',label:'上海'}]},{value:'south',label:'华南',children:[{value:'shenzhen',label:'深圳'},{value:'guangzhou',label:'广州',disabled:true}]}]} value={value} onValueChange={setValue}/><output>{JSON.stringify(value)}</output><Button onClick={()=>setValue([])}>清空</Button></div>;}

import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Mentions} from '@ksf/sdk/mentions';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function MentionsControlledExample(){const [value,setValue]=useState<string>('');return <div className='ksf-demo-stack'><Mentions label='受控值' options={[{value:'design',label:'设计',description:'界面与交互'},{value:'research',label:'研究',description:'需求与验证'},{value:'build',label:'开发'},{value:'blocked',label:'暂不可用',disabled:true}]} value={value} onValueChange={setValue}/><output>{JSON.stringify(value)}</output><Button onClick={()=>setValue('')}>清空</Button></div>;}

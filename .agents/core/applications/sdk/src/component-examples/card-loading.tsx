import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Card} from '@ksf/sdk/card';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CardLoadingExample(){const [loading,setLoading]=useState(true);return <div className='ksf-demo-stack'><Button onClick={()=>setLoading(v=>!v)}>切换加载</Button><Card title='项目摘要' loading={loading}>资料已经加载完成。</Card></div>;}

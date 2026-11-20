import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Skeleton} from '@ksf/sdk/skeleton';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SkeletonLoadedExample(){const [loading,setLoading]=useState(true);return <div className='ksf-demo-stack'><Button onClick={()=>setLoading(v=>!v)}>切换加载</Button><Skeleton loading={loading} avatar active><h4>项目资料</h4><p>已载入的真实内容。</p></Skeleton></div>;}

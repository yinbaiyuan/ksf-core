import {useState,useRef,useEffect} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Skeleton} from '@ksf/sdk/skeleton';
export function SkeletonStatesExample(){const [loading,setLoading]=useState(true);return <div className='ksf-demo-stack'><Button size='small' onClick={()=>setLoading(v=>!v)}>{loading?'展示内容':'展示骨架'}</Button><Skeleton loading={loading} active rows={2} widths={['100%','55%']}><h3>项目资料</h3><p>内容加载完成后显示，骨架不制造重复业务请求。</p></Skeleton></div>;}

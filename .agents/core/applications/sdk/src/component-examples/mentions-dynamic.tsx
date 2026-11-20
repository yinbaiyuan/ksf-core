import {useEffect,useRef,useState} from 'react';
import {Mentions} from '@ksf/sdk/mentions';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function MentionsDynamicExample(){const [team,setTeam]=useState(false),[loading,setLoading]=useState(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);useEffect(()=>()=>clearTimeout(timer.current),[]);const load=()=>{if(loading)return;setLoading(true);timer.current=setTimeout(()=>{setTeam(value=>!value);setLoading(false);},900);};return <div className="ksf-demo-stack"><Button loading={loading} onClick={load}>切换协作组</Button><Mentions label="消息" loading={loading} options={team?[{value:'xiaolin',label:'小林'},{value:'xiaowang',label:'小王'}]:[{value:'xiaoli',label:'小李'}]} placeholder="输入 @ 查看当前组成员"/><Mentions label="查找中状态" loading options={[]} placeholder="输入 @ 查看等待状态，Enter 不会提交"/><Mentions label="无匹配状态" options={[]} placeholder="输入 @ 查看空态"/></div>;}

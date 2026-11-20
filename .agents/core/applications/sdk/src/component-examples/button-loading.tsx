import {useEffect,useRef,useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {View} from '@ksf/sdk/view';
export function ButtonLoadingExample() {
  const [loading,setLoading]=useState(false),[fail,setFail]=useState(false),[feedback,setFeedback]=useState('应用管理保存与重试，按钮负责表达执行状态');
  const timer=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const save=()=>{setLoading(true);setFeedback('正在模拟保存…');timer.current=setTimeout(()=>{setLoading(false);setFeedback(fail?'模拟保存失败，可以重试':'模拟保存完成');},1000);};
  return <View style={{gap:16,background:'transparent'}}><div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}><Button variant="solid" tone="primary" loading={loading} onClick={save}>{loading?'保存中':'保存资料'}</Button><label style={{display:'flex',gap:6,alignItems:'center',fontSize:13}}><input type="checkbox" checked={fail} disabled={loading} onChange={event=>setFail(event.target.checked)}/>模拟保存失败</label></div><output role="status">{feedback}</output></View>;
}

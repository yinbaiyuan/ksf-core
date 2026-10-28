import {useEffect,useRef,useState} from 'react';
import {mountReact,useApplicationSDK} from '@ksf/sdk/react';
import {createAIMaterialClient} from '@ksf/sdk/ai-materials';
import type {AIMaterial,AIServiceDescription,ApplicationSDK2} from '@ksf/sdk';
import './style.css';
function App() {
  const sdk=useApplicationSDK(),upload=useRef<AbortController|null>(null);
  const [profiles,setProfiles]=useState<AIServiceDescription['profiles']>([]),[profile,setProfile]=useState('');
  const [text,setText]=useState('虚构材料：今天完成接口核对，明天继续验证。');
  const [state,setState]=useState<unknown>(null),[error,setError]=useState('');
  const [material,setMaterial]=useState<AIMaterial|null>(null),[result,setResult]=useState<unknown>(null),[uploading,setUploading]=useState(false);
  useEffect(()=>{
    let live=true,pending=false;
    const load=async()=>{
      if(pending||!sdk.getSnapshot().enabled||document.hidden)return;
      pending=true;
      try{const value=await sdk.call('state');if(live)setState(value);}
      catch(error){if(live)setError((error as Error).message);}
      finally{pending=false;}
    };
    void sdk.call<AIServiceDescription>('profiles').then(value=>{
      if(live){const compatible=value.profiles.filter(profile=>profile.capabilities.includes('text'));setProfiles(compatible);setProfile(compatible[0]?.id??'');}
    }).catch(error=>{if(live)setError(error.message);});
    void load();const timer=setInterval(()=>void load(),1500);
    return()=>{live=false;clearInterval(timer);upload.current?.abort();};
  },[sdk]);
  function action(method:string) {
    setError('');
    void sdk.call(method,{profileId:profile,text,material}).then(method==='result'?setResult:setState).catch(error=>setError(error.message));
  }
  async function selectMaterial(file:File) {
    upload.current?.abort();const controller=new AbortController();upload.current=controller;setUploading(true);
    try {
      const value=await createAIMaterialClient(sdk).upload({name:file.name,mimeType:file.type||'text/plain'},file,{signal:controller.signal});
      if(!controller.signal.aborted){setMaterial(value);setError('');}
    }catch(error){if(!controller.signal.aborted)setError((error as Error).message);}
    finally{if(upload.current===controller){upload.current=null;setUploading(false);}}
  }
  return <main className="example-app">
    <h1>AI 任务示例</h1><p>手动提交；关闭窗口不会取消任务。没有默认付费调用或定时。</p>
    <select aria-label="执行配置" value={profile} onChange={event=>setProfile(event.target.value)}>
      {profiles.map(profile=><option key={profile.id} value={profile.id}>{profile.id}</option>)}
    </select>
    <textarea aria-label="材料" value={text} onChange={event=>setText(event.target.value)}/>
    <label>可选材料<input aria-label="上传材料" type="file" accept=".txt,.md,text/plain,text/markdown" onChange={event=>{const file=event.target.files?.[0];if(file)void selectMaterial(file);}}/></label>
    <button disabled={!uploading} onClick={()=>upload.current?.abort()}>取消上传</button>
    {material&&<p>材料已就绪：{material.name}</p>}
    <div><button disabled={!profile||uploading} onClick={()=>action('submit')}>提交或恢复原任务</button>
      <button onClick={()=>action('cancel')}>请求取消任务</button><button onClick={()=>action('result')}>读取成功结果</button></div>
    {error&&<p role="alert">{error}</p>}
    {result!==null&&<section aria-label="成功结果"><h2>成功结果</h2><pre>{JSON.stringify(result,null,2)}</pre></section>}
    <pre>{JSON.stringify(state,null,2)}</pre>
  </main>;
}
export const mount=(container:HTMLElement,sdk:ApplicationSDK2)=>mountReact(App,container,sdk);

import {useCallback, useEffect, useRef, useState} from 'react';
import {useMotionActivity} from '../motion-activity';

/** Showcase-only waits. No network, file write, model or business operation. */
export function useLocalDemoTasks() {
  const sequence = useRef(0), pending = useRef(new Map<number, {timer: ReturnType<typeof setTimeout>; reject: (error: unknown) => void}>());
  const cancel = useCallback(() => {for (const task of pending.current.values()) {clearTimeout(task.timer); task.reject(new DOMException('本地演示已取消', 'AbortError'));} pending.current.clear();}, []);
  useEffect(() => cancel, [cancel]);
  const wait = useCallback((milliseconds = 700) => new Promise<void>((resolve, reject) => {
    const id = ++sequence.current;
    const timer = setTimeout(() => {pending.current.delete(id); resolve();}, Math.max(0,milliseconds));
    pending.current.set(id,{timer,reject});
  }), []);
  return {wait, cancel};
}

/** Local timeline for playback UI in hosts without a media playback capability. */
export function useLocalTimeline(duration = 8) {
 const activity = useMotionActivity<HTMLDivElement>({respectReducedMotion: false});
 const [time, setTime] = useState(0), [playing, setPlaying] = useState(false), timeRef=useRef(0); timeRef.current=time;
 useEffect(() => {if (!activity.active) setPlaying(false);}, [activity.active]);
 useEffect(() => {if (!playing || !activity.active || !Number.isFinite(duration) || duration <= 0) return;
  const timer = setInterval(() => {const next=Math.min(duration,timeRef.current+.1);timeRef.current=next;setTime(next);if(next>=duration)setPlaying(false);}, 100);
  return () => clearInterval(timer);
 }, [playing, activity.active, duration]);
 return {ref: activity.ref, time, setTime, playing, setPlaying, active: activity.active};
}

export interface LocalWorkflowState {phase:'idle'|'running'|'done'|'error'|'cancelled';step:number;labels:readonly string[];message:string}
/** Demo-only, cancellable steps. This does not call a business service. */
export function useLocalWorkflow() {
 const tasks=useLocalDemoTasks(),activity=useMotionActivity<HTMLDivElement>({respectReducedMotion:false});
 const [state,setState]=useState<LocalWorkflowState>({phase:'idle',step:0,labels:[],message:''});
 const busy=useRef(false),version=useRef(0),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;version.current++;tasks.cancel();};},[tasks.cancel]);
 const cancel=useCallback(()=>{version.current++;busy.current=false;tasks.cancel();if(alive.current)setState(s=>s.phase==='running'?{...s,phase:'cancelled',message:'本地演示已取消。'}:s);},[tasks.cancel]);
 useEffect(()=>{if(!activity.active&&busy.current)cancel();},[activity.active,cancel]);
 const run=useCallback(async(labels:readonly string[],options:{failAt?:number;delay?:number}={})=>{
  if(busy.current)return false;const current=++version.current;busy.current=true;
  setState({phase:'running',step:0,labels,message:''});
  try{for(let i=0;i<labels.length;i++){if(current!==version.current||!alive.current)return false;setState({phase:'running',step:i,labels,message:''});await tasks.wait(options.delay??600);if(options.failAt===i)throw new Error('模拟步骤失败，输入仍保留，可重试。');}
   if(current!==version.current||!alive.current)return false;setState({phase:'done',step:labels.length,labels,message:'本地演示完成。'});return true;
  }catch(error){if(current===version.current&&alive.current)setState(s=>({...s,phase:error instanceof DOMException&&error.name==='AbortError'?'cancelled':'error',message:error instanceof Error?error.message:'模拟失败。'}));return false;
  }finally{if(current===version.current)busy.current=false;}
 },[tasks.wait]);
 const reset=useCallback(()=>{cancel();if(alive.current)setState({phase:'idle',step:0,labels:[],message:''});},[cancel]);
 return {ref:activity.ref,state,run,cancel,reset,active:activity.active};
}

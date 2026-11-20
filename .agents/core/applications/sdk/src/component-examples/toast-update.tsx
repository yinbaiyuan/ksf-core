import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Toast,useFeedback} from '@ksf/sdk/toast';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ToastUpdateExample(){const feedback=useFeedback(),timer=useRef<ReturnType<typeof setTimeout>|null>(null);useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);return <><Button onClick={()=>{const id=feedback.show({id:'process',heading:'处理中…',tone:'loading'});if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>feedback.update(id,{heading:'已完成',tone:'success',duration:3}),800);}}>开始处理</Button><Toast items={feedback.items} onDismiss={feedback.dismiss}/></>;}

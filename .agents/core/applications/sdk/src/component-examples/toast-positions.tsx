import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Toast,useFeedback} from '@ksf/sdk/toast';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ToastPositionsExample(){const feedback=useFeedback(),[placement,setPlacement]=useState<'top-start'|'top'|'top-end'|'bottom-start'|'bottom'|'bottom-end'>('top-end');return <div className='ksf-demo-row'>{(['top-start','top','top-end','bottom-start','bottom','bottom-end'] as const).map(p=><Button key={p} size='small' onClick={()=>{setPlacement(p);feedback.show({id:'position',heading:p,description:'提示限定在所属 KSF 窗口。'});}}>{p}</Button>)}<Toast items={feedback.items} onDismiss={feedback.dismiss} placement={placement}/></div>;}

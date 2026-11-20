import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Toast,useFeedback} from '@ksf/sdk/toast';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ToastTonesExample(){const feedback=useFeedback();return <div className='ksf-demo-row'>{(['success','info','warning','error'] as const).map(tone=><Button key={tone} onClick={()=>feedback.show({heading:tone+' 消息',tone})}>{tone}</Button>)}<Toast items={feedback.items} onDismiss={feedback.dismiss}/></div>;}

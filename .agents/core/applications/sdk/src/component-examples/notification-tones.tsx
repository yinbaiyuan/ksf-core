import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Notification,useFeedback} from '@ksf/sdk/notification';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function NotificationTonesExample(){const feedback=useFeedback();return <div className='ksf-demo-row'>{(['success','info','warning','error'] as const).map(tone=><Button key={tone} onClick={()=>feedback.show({heading:tone+' 消息',tone})}>{tone}</Button>)}<Notification items={feedback.items} onDismiss={feedback.dismiss}/></div>;}

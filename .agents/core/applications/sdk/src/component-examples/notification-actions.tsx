import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Notification,useFeedback} from '@ksf/sdk/notification';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function NotificationActionsExample(){const feedback=useFeedback();return <><Button onClick={()=>feedback.show({id:'action',heading:'资料待确认',description:'操作由当前应用处理。',duration:0,actions:<Button size='small' onClick={()=>feedback.dismiss('action')}>确认收到</Button>})}>显示可操作提示</Button><Notification items={feedback.items} onDismiss={feedback.dismiss}/></>;}

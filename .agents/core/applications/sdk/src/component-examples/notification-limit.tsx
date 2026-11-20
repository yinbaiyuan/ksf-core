import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Notification,useFeedback} from '@ksf/sdk/notification';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function NotificationLimitExample(){const feedback=useFeedback({limit:3}),sequence=useRef(0);return <><Button onClick={()=>feedback.show({heading:'消息 '+(++sequence.current),duration:0})}>添加（最多3条）</Button><Button onClick={feedback.clear}>清空</Button><Notification items={feedback.items} onDismiss={feedback.dismiss}/></>;}

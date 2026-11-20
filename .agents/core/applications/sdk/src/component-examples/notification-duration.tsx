import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Notification,useFeedback} from '@ksf/sdk/notification';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function NotificationDurationExample(){const feedback=useFeedback();return <div className='ksf-demo-row'><Button onClick={()=>feedback.show({heading:'等待手动处理',duration:0})}>持续提示</Button><Button onClick={feedback.clear}>关闭全部</Button><Notification items={feedback.items} onDismiss={feedback.dismiss}/></div>;}

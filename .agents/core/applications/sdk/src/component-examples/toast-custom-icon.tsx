import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Toast,useFeedback} from '@ksf/sdk/toast';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ToastCustomIconExample(){const feedback=useFeedback();return <><Button onClick={()=>feedback.show({heading:'文件已就绪',icon:<FolderGlyph/>})}>显示文件提示</Button><Toast items={feedback.items} onDismiss={feedback.dismiss}/></>;}

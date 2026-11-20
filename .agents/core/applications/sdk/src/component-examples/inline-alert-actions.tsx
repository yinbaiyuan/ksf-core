import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {InlineAlert} from '@ksf/sdk/inline-alert';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function InlineAlertActionsExample(){const [message,setMessage]=useState('检查结果待处理');return <InlineAlert heading={message} actions={<Button size='small' onClick={()=>setMessage('已重新检查')}>重试</Button>}>在提示旁直接处理。</InlineAlert>;}

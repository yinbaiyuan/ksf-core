import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {InlineAlert} from '@ksf/sdk/inline-alert';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function InlineAlertCustomIconExample(){return <div className='ksf-demo-stack'><InlineAlert heading='文件准备就绪' icon={<FolderGlyph/>}/><InlineAlert heading='简洁提示' icon={false}/></div>;}

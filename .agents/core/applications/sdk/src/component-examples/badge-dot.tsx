import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Badge} from '@ksf/sdk/badge';import {Avatar} from '@ksf/sdk/avatar';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function BadgeDotExample(){return <div className='ksf-demo-row'><Badge dot tone='success' text='运行正常'/><Badge dot tone='warning' text='待处理'/><Badge dot tone='danger' text='失败'/></div>;}

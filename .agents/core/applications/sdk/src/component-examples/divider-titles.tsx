import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Divider} from '@ksf/sdk/divider';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DividerTitlesExample(){return <div className='ksf-demo-stack'><Divider labelPosition='start'>起始标题</Divider><Divider>居中标题</Divider><Divider labelPosition='end'>末尾标题</Divider></div>;}

import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Divider} from '@ksf/sdk/divider';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DividerPlainExample(){return <div className='ksf-demo-stack'><Divider>强调标题</Divider><Divider plain>正文标题</Divider><Divider plain labelPosition='start'>正文起始标题</Divider></div>;}

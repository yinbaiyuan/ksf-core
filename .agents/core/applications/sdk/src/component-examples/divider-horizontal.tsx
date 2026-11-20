import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Divider} from '@ksf/sdk/divider';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DividerHorizontalExample(){return <div className='ksf-demo-stack'><p>内容段落一</p><Divider decorative={false}/><p>内容段落二</p><Divider variant='dashed'/><p>内容段落三</p></div>;}

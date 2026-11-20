import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Divider} from '@ksf/sdk/divider';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DividerCustomStyleExample(){return <div className='ksf-demo-stack'><Divider style={{borderColor:'var(--ksf-color-primary)'}}>主色边界</Divider><Divider variant='dotted' style={{borderColor:'var(--ksf-color-danger)'}}><span style={{color:'var(--ksf-color-danger)'}}>危险区域</span></Divider></div>;}

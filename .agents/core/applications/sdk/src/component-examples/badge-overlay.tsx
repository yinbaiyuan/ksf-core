import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Badge} from '@ksf/sdk/badge';import {Avatar} from '@ksf/sdk/avatar';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function BadgeOverlayExample(){return <div className='ksf-demo-row'><Badge count={8}><Avatar name='小林'/></Badge><Badge dot><Button>消息</Button></Badge></div>;}

import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Tooltip} from '@ksf/sdk/tooltip';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TooltipNativeExample(){return <div className='ksf-demo-row'><Tooltip content='原生按钮'><button type='button'>原生按钮</button></Tooltip><Tooltip content='操作暂不可用'><span tabIndex={0}><Button disabled>禁用按钮</Button></span></Tooltip></div>;}

import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Popover} from '@ksf/sdk/popover';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PopoverTriggersExample(){return <div className='ksf-demo-row'>{(['click','hover','focus'] as const).map(trigger=><Popover key={trigger} label={trigger} trigger={trigger} heading={trigger} content='可以操作的内容'><Button>{trigger}</Button></Popover>)}</div>;}

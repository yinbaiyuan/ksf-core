import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Popover} from '@ksf/sdk/popover';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PopoverArrowExample(){return <Popover label='无箭头浮层' arrow={false} content='更简洁的浮层内容'><Button>无箭头</Button></Popover>;}

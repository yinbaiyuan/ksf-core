import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Tooltip} from '@ksf/sdk/tooltip';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TooltipDelayExample(){return <Tooltip content='指针延迟800ms，键盘焦点立即显示' delay={800}><Button>悬停或按 Tab 聚焦</Button></Tooltip>;}

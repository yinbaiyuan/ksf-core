import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Tooltip} from '@ksf/sdk/tooltip';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TooltipRichExample(){return <Tooltip content={<span><strong>资料范围</strong><br/>设计、研究和工程说明。</span>}><Button>查看说明</Button></Tooltip>;}

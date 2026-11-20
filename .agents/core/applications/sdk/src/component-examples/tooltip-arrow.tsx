import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Tooltip} from '@ksf/sdk/tooltip';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TooltipArrowExample(){return <div className='ksf-demo-row'><Tooltip content='带箭头'><Button>带箭头</Button></Tooltip><Tooltip content='无箭头' arrow={false}><Button>无箭头</Button></Tooltip></div>;}

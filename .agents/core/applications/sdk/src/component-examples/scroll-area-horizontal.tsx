import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ScrollArea} from '@ksf/sdk/scroll-area';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ScrollAreaHorizontalExample(){return <ScrollArea label='水平项目列表' orientation='horizontal' style={{height:130}}><div style={{display:'flex',gap:12,width:'max-content',padding:8}}>{Array.from({length:10},(_,i)=><DemoPanel emphasis key={i} style={{width:140}}>项目{i+1}</DemoPanel>)}</div></ScrollArea>;}

import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {EmptyState} from '@ksf/sdk/empty-state';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function EmptyStateActionsExample(){const [created,setCreated]=useState(false);return created?<p role='status'>已创建第一份资料</p>:<EmptyState heading='还没有资料' actions={<Button onClick={()=>setCreated(true)}>创建资料</Button>}/>;}

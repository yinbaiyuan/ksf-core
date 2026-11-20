import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {InlineAlert} from '@ksf/sdk/inline-alert';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function InlineAlertDismissExample(){const [open,setOpen]=useState(true);return open?<InlineAlert heading='更新已保存' tone='success' onDismiss={()=>setOpen(false)}>可以继续下一步。</InlineAlert>:<Button onClick={()=>setOpen(true)}>重新显示</Button>;}

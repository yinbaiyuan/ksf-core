import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Space} from '@ksf/sdk/space';
import {TextField} from '@ksf/sdk/text-field';
import {Select} from '@ksf/sdk/select';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SpaceSizesExample(){const [gap,setGap]=useState(16);return <div className='ksf-demo-stack'><label>间隔{gap}px <input type='range' min='0' max='40' value={gap} onChange={e=>setGap(+e.target.value)}/></label><Space gap={gap}><Button>操作一</Button><Button>操作二</Button><Button>操作三</Button></Space></div>;}

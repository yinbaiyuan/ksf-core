import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Grid,GridItem} from '@ksf/sdk/grid';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function GridOrderExample(){const [reversed,setReversed]=useState(false);return <div className='ksf-demo-stack'><Button onClick={()=>setReversed(v=>!v)}>切换顺序</Button><Grid columns={3} gap={8}>{[1,2,3].map(i=><GridItem key={i} style={{order:reversed?4-i:i}}><DemoPanel emphasis>项目{i}</DemoPanel></GridItem>)}</Grid></div>;}

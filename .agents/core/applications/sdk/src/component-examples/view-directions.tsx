import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {View} from '@ksf/sdk/view';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ViewDirectionsExample(){const [row,setRow]=useState(true);return <div className='ksf-demo-stack'><Button size='small' onClick={()=>setRow(v=>!v)}>切换方向</Button><View direction={row?'row':'column'} gap={10}>{[1,2,3].map(i=><DemoPanel emphasis key={i} style={{flex:1}}>内容{i}</DemoPanel>)}</View></div>;}

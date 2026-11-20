import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {View} from '@ksf/sdk/view';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ViewGapExample(){const [gap,setGap]=useState(16);return <div className='ksf-demo-stack'><label>间距{gap}px <input type='range' min='0' max='32' value={gap} onChange={e=>setGap(Number(e.target.value))}/></label><View direction='row' gap={gap}>{[1,2,3].map(i=><DemoPanel key={i} emphasis style={{flex:1}}>{i}</DemoPanel>)}</View></div>;}

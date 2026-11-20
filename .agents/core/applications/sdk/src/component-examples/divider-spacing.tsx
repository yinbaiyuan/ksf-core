import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Divider} from '@ksf/sdk/divider';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DividerSpacingExample(){const [margin,setMargin]=useState(16);return <div><label>上下间距{margin}px <input type='range' min='4' max='40' value={margin} onChange={e=>setMargin(+e.target.value)}/></label><p>前面的正文</p><Divider style={{marginBlock:margin}}>分割文字</Divider><p>后面的正文</p></div>;}
